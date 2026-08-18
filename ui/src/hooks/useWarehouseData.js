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

export function useWarehouseData() {
  const [orders, setOrders] = useState(getInitialOrders);
  const [metadata, setMetadata] = useState(getInitialMetadata);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);

  // Expose function to update an order (state + Firestore)
  const updateOrder = async (orderId, updatedFields) => {
    // 1. Always update local state first for immediate responsiveness
    setOrders(prev => {
      const exists = prev.some(o => o.Order_ID === orderId || o.id === orderId);
      const updated = exists 
        ? prev.map(o => {
            const match = (o.Order_ID && o.Order_ID === orderId) || (o.id && o.id === orderId);
            return match ? { ...o, ...updatedFields } : o;
          })
        : [...prev, { Order_ID: orderId, id: orderId, ...updatedFields }];
      
      localStorage.setItem('warehouse_orders', JSON.stringify(updated));
      return updated;
    });

    // 2. Persist update in Firestore if connected
    if (isFirebaseConnected) {
      try {
        const docRef = doc(db, 'warehouse_orders', orderId);
        await setDoc(docRef, updatedFields, { merge: true });
        console.log(`Firestore setDoc successful for order: ${orderId}`);
      } catch (err) {
        console.error("Firestore setDoc failed, local state preserved:", err);
      }
    }
  };

  // Expose function to update metadata (state + LocalStorage + Firestore)
  const updateMetadata = async (updatedFields) => {
    setMetadata(prev => {
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('warehouseiq_metadata', JSON.stringify(updated));
      return updated;
    });

    if (isFirebaseConnected) {
      try {
        const metaRef = doc(db, 'warehouseiq_metadata', 'latest_training');
        await setDoc(metaRef, updatedFields, { merge: true });
      } catch (err) {
        console.warn("Failed to persist metadata updates to Firestore:", err.message);
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
