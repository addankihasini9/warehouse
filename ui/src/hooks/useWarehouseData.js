import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, getDoc, writeBatch, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Import local dataset and reports as the source of truth / fallback
import localOrders from '../data/warehouse_orders.json';
import localProfile from '@reports/data_profile.json';
import localReport from '@reports/ml_training_report.json';

const getInitialOrders = () => {
  const stored = localStorage.getItem('warehouse_orders');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return localOrders;
    }
  }
  return localOrders;
};

const getInitialMetadata = () => {
  const stored = localStorage.getItem('warehouseiq_metadata');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return {
        data_profile: localProfile,
        training_report: localReport,
        updated_at: new Date().toISOString(),
        row_count: localOrders.length
      };
    }
  }
  return {
    data_profile: localProfile,
    training_report: localReport,
    updated_at: new Date().toISOString(),
    row_count: localOrders.length
  };
};

// ─── Input Sanitization & Validation Helpers ──────────────────────────────────

/** Strip HTML tags to prevent XSS injection in any string field */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim();
};

/** Ensure numeric fields are always ≥ 0 */
const clampNonNegative = (val) => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return Math.max(0, num);
};

/** Validate an Order_ID — must be alphanumeric (with underscores), 3–20 chars */
const isValidOrderId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[A-Za-z0-9_]{3,20}$/.test(id.trim());
};

/** Fields that must always be non-negative integers */
const NUMERIC_NON_NEGATIVE_FIELDS = [
  'Order_Quantity', 'Quantity_Allocated', 'Quantity_Picked',
  'Total_Inventory_On_Hand', 'Total_Reserved', 'Total_Available',
  'Damaged_Items', 'row_count', 'Avg_Daily_Demand_Units'
];

/** Fields that are plain user-facing strings — sanitize for XSS */
const STRING_SANITIZE_FIELDS = [
  'Order_Priority', 'Product_Name', 'SKU', 'Warehouse_ID',
  'Carrier', 'Packing_Status', 'Dispatch_Status'
];

/**
 * Apply validation and sanitization to any order update payload.
 * Throws if a critical field like Order_ID is invalid.
 */
const validateAndSanitizeOrderPayload = (orderId, fields) => {
  if (!isValidOrderId(orderId)) {
    throw new Error(`Invalid Order_ID: "${orderId}". Must be 3–20 alphanumeric characters.`);
  }

  const sanitized = { ...fields };

  NUMERIC_NON_NEGATIVE_FIELDS.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = clampNonNegative(sanitized[field]);
    }
  });

  STRING_SANITIZE_FIELDS.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = sanitizeString(sanitized[field]);
    }
  });

  return sanitized;
};

// ─────────────────────────────────────────────────────────────────────────────

export function useWarehouseData() {
  const [orders, setOrders] = useState(getInitialOrders);
  const [metadata, setMetadata] = useState(getInitialMetadata);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);

  // Expose function to update an order (state + Firestore)
  const updateOrder = async (orderId, updatedFields) => {
    // Validate + sanitize before writing anywhere
    let sanitizedFields;
    try {
      sanitizedFields = validateAndSanitizeOrderPayload(orderId, updatedFields);
    } catch (validationErr) {
      console.error('[updateOrder] Validation failed:', validationErr.message);
      setError(`Invalid update: ${validationErr.message}`);
      return;
    }

    // 1. Always update local state first for immediate responsiveness
    setOrders(prev => {
      const exists = prev.some(o => o.Order_ID === orderId || o.id === orderId);
      const updated = exists 
        ? prev.map(o => {
            const match = (o.Order_ID && o.Order_ID === orderId) || (o.id && o.id === orderId);
            return match ? { ...o, ...sanitizedFields } : o;
          })
        : [...prev, { Order_ID: orderId, id: orderId, ...sanitizedFields }];
      
      localStorage.setItem('warehouse_orders', JSON.stringify(updated));
      return updated;
    });

    // 2. Persist update in Firestore if connected
    if (isFirebaseConnected) {
      try {
        const docRef = doc(db, 'warehouse_orders', orderId);
        await setDoc(docRef, sanitizedFields, { merge: true });
      } catch (err) {
        // Log only a safe message to avoid leaking internal structure to the UI
        console.error("Firestore update failed, local state preserved.");
      }
    }
  };

  // Expose function to update metadata (state + LocalStorage + Firestore)
  const updateMetadata = async (updatedFields) => {
    // Sanitize row_count if present
    const sanitized = { ...updatedFields };
    if ('row_count' in sanitized) {
      sanitized.row_count = clampNonNegative(sanitized.row_count);
    }

    setMetadata(prev => {
      const updated = { ...prev, ...sanitized };
      localStorage.setItem('warehouseiq_metadata', JSON.stringify(updated));
      return updated;
    });

    if (isFirebaseConnected) {
      try {
        const metaRef = doc(db, 'warehouseiq_metadata', 'latest_training');
        await setDoc(metaRef, sanitized, { merge: true });
      } catch (err) {
        console.warn("Failed to persist metadata updates to Firestore.");
      }
    }
  };

  useEffect(() => {
    let unsubscribe = null;

    const initializeDataConnection = async () => {
      try {
        const ordersCol = collection(db, 'warehouse_orders');
        
        // Race the initial getDocs fetch against a 2-second timeout to handle offline/blocked firestore backend
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Firestore connection timed out (2s limit reached)")), 2000)
        );

        const snapshot = await Promise.race([
          getDocs(ordersCol),
          timeoutPromise
        ]);

        setIsFirebaseConnected(true);

        // SEEDING: If Firestore has 0 documents, populate it with our local source of truth CSV data
        if (snapshot.empty) {
          console.log("Firestore empty. Seeding database with 150 local orders...");
          const batch = writeBatch(db);
          
          localOrders.forEach((o) => {
            const orderId = String(o.Order_ID || `ORD_${Math.random().toString(36).substr(2, 9)}`);
            const docRef = doc(db, 'warehouse_orders', orderId);
            batch.set(docRef, o);
          });
          
          // Seed metadata
          const metaRef = doc(db, 'warehouseiq_metadata', 'latest_training');
          batch.set(metaRef, {
            data_profile: localProfile,
            training_report: localReport,
            updated_at: new Date().toISOString(),
            row_count: localOrders.length
          });

          await batch.commit();
          console.log("Seeding complete. Firestore is now populated.");
        } else {
          // If metadata doesn't exist, seed it
          const metaRef = doc(db, 'warehouseiq_metadata', 'latest_training');
          const metaSnap = await getDoc(metaRef);
          if (!metaSnap.exists()) {
            await setDoc(metaRef, {
              data_profile: localProfile,
              training_report: localReport,
              updated_at: new Date().toISOString(),
              row_count: localOrders.length
            });
          }
        }

        // Fetch latest metadata
        const metaRef = doc(db, 'warehouseiq_metadata', 'latest_training');
        const metaSnap = await getDoc(metaRef);
        if (metaSnap.exists()) {
          const metaData = metaSnap.data();
          setMetadata(metaData);
          localStorage.setItem('warehouseiq_metadata', JSON.stringify(metaData));
        }

        // Establish real-time listener to warehouse_orders
        unsubscribe = onSnapshot(ordersCol, (liveSnapshot) => {
          const liveOrders = liveSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          // Sort by Order_ID to maintain order consistency
          liveOrders.sort((a, b) => {
            const idA = a.Order_ID || '';
            const idB = b.Order_ID || '';
            return idA.localeCompare(idB);
          });
          setOrders(liveOrders);
          localStorage.setItem('warehouse_orders', JSON.stringify(liveOrders));
          setLoading(false);
        }, (err) => {
          console.error("Firestore subscription error, using local fallback:", err);
          setLoading(false);
        });

      } catch (err) {
        console.warn("Firestore connection unavailable (operating in offline fallback mode):", err.message);
        // Fallback directly to localStorage or JSON assets
        const stored = localStorage.getItem('warehouse_orders');
        if (stored) {
          try {
            setOrders(JSON.parse(stored));
          } catch (e) {
            setOrders(localOrders);
          }
        } else {
          setOrders(localOrders);
        }

        setMetadata({
          data_profile: localProfile,
          training_report: localReport,
          updated_at: new Date().toISOString(),
          row_count: localOrders.length
        });
        setLoading(false);
        setIsFirebaseConnected(false);
      }
    };

    initializeDataConnection();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { orders, metadata, loading, error, updateOrder, updateMetadata };
}
