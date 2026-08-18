import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, CheckCircle, Truck, AlertTriangle, ArrowRight, X, Plus } from 'lucide-react';
import { getOrderStage, getNextStageAction, getLifecyclePayload, LIFECYCLE_STAGES } from '../utils/lifecycle';

const PRODUCT_CATALOG = {
  'SKU001': 'Office Chair',
  'SKU002': 'Mechanical Keyboard',
  'SKU003': 'USB-C Hub',
  'SKU004': 'Laptop Stand',
  'SKU005': 'Webcam HD',
  'SKU006': 'Bluetooth Headphones',
  'SKU007': 'Power Bank 20000mAh',
  'SKU008': 'Desk Lamp',
  'SKU009': 'Monitor 24 Inch',
  'SKU010': 'External SSD 1TB',
  'SKU011': 'USB Keyboard',
  'SKU012': 'Wireless Charger',
  'SKU013': 'HDMI Cable',
  'SKU014': 'Laptop Backpack',
  'SKU015': 'Tablet Stand'
};

export default function OrderManagement({ orders = [], updateOrder, searchQuery = '' }) {
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form State
  const [formSku, setFormSku] = useState('SKU002');
  const [formQty, setFormQty] = useState(5);
  const [formPriority, setFormPriority] = useState('High');

  // Active orders (not fully dispatched) filtered by search query
  const activeOrders = useMemo(() => {
    return orders.filter(o => 
      o.Dispatch_Status !== 'Dispatched' &&
      (!searchQuery || 
        (o.Order_ID && o.Order_ID.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.Product_Name && o.Product_Name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.SKU && o.SKU.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    );
  }, [orders, searchQuery]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => (o.Order_ID === selectedOrderId || o.id === selectedOrderId));
  }, [orders, selectedOrderId]);

  // Aggregate metrics
  const pendingAllocation = orders.filter(o => o.Dispatch_Status !== 'Dispatched' && o.Quantity_Allocated < o.Order_Quantity).length;
  const criticalOrders = orders.filter(o => o.Dispatch_Status !== 'Dispatched' && o.Order_Priority === 'Critical').length;
  const successfullyAllocated = orders.filter(o => o.Dispatch_Status !== 'Dispatched' && o.Quantity_Allocated >= o.Order_Quantity).length;

  const currentStage = selectedOrder ? getOrderStage(selectedOrder) : null;
  const nextAction = selectedOrder ? getNextStageAction(currentStage) : null;

  const handleAdvanceStage = async () => {
    if (!selectedOrder || !nextAction) return;

    const action = nextAction.action;
    const payload = getLifecyclePayload(action, selectedOrder, orders);

    // SKU Stock propagation for consistency across orders of the same SKU
    if (payload.Total_Available !== undefined || payload.Total_Inventory_On_Hand !== undefined) {
      const targetSku = selectedOrder.SKU;
      const sameSkuOrders = orders.filter(o => o.SKU === targetSku);
      
      for (const o of sameSkuOrders) {
        await updateOrder(o.Order_ID || o.id, {
          Total_Inventory_On_Hand: payload.Total_Inventory_On_Hand !== undefined ? payload.Total_Inventory_On_Hand : o.Total_Inventory_On_Hand,
          Total_Reserved: payload.Total_Reserved !== undefined ? payload.Total_Reserved : o.Total_Reserved,
          Total_Available: payload.Total_Available !== undefined ? payload.Total_Available : o.Total_Available
        });
      }
    }

    // Update the main order fields (Allocation, Picking, QA, Dispatch parameters)
    await updateOrder(selectedOrder.Order_ID || selectedOrder.id, payload);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();

    // 1. Generate next Order ID
    const maxId = orders.reduce((max, o) => {
      if (!o.Order_ID) return max;
      const num = parseInt(o.Order_ID.replace('ORD', ''), 10);
      return isNaN(num) ? max : (num > max ? num : max);
    }, 0);
    const nextOrderId = 'ORD' + String(maxId + 1).padStart(4, '0');

    // 2. Fetch templates for this SKU to copy stock parameters
    const template = orders.find(o => o.SKU === formSku) || {
      Warehouse_ID: 'WH001',
      Warehouse_Name: 'Hyderabad Central',
      Warehouse_City: 'Hyderabad',
      Total_Inventory_On_Hand: 500,
      Total_Reserved: 50,
      Total_Available: 450,
      Avg_Daily_Demand_Units: 15.0
    };

    const newOrder = {
      Order_ID: nextOrderId,
      id: nextOrderId,
      SKU: formSku,
      Product_Name: PRODUCT_CATALOG[formSku],
      Warehouse_ID: template.Warehouse_ID,
      Warehouse_Name: template.Warehouse_Name,
      Warehouse_City: template.Warehouse_City,
      Order_Created_At: new Date().toISOString().replace('T', ' ').substring(0, 16),
      Order_Quantity: formQty,
      Order_Priority: formPriority,
      Inventory_Available: 'No',
      Quantity_Allocated: 0,
      Quantity_Picked: 0,
      Packing_Status: 'Pending',
      Dispatch_Status: 'Pending',
      Damaged_Items: 0,
      Total_Inventory_On_Hand: template.Total_Inventory_On_Hand,
      Total_Reserved: template.Total_Reserved,
      Total_Available: template.Total_Available,
      Avg_Daily_Demand_Units: template.Avg_Daily_Demand_Units
    };

    await updateOrder(nextOrderId, newOrder);
    
    // Auto-select the newly created order
    setSelectedOrderId(nextOrderId);
    setShowCreateForm(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <header className="page-header">
        <h1 className="page-title">Order Management & Allocation</h1>
        <p className="page-subtitle">Manage active orders, prioritizations, and inventory allocation in real-time</p>
      </header>

      <div className="grid-3" style={{marginBottom: '32px'}}>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>PENDING ALLOCATION</h3>
          <div className="metric-value">{pendingAllocation}</div>
        </div>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>CRITICAL PRIORITY</h3>
          <div className="metric-value" style={{color: 'var(--danger)'}}>{criticalOrders}</div>
        </div>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>FULLY ALLOCATED</h3>
          <div className="metric-value" style={{color: 'var(--success)'}}>{successfullyAllocated}</div>
        </div>
      </div>

      <div style={{display: 'flex', gap: '24px', alignItems: 'flex-start'}}>
        {/* Orders Queue Table */}
        <div className="glass-card" style={{flex: (selectedOrder || showCreateForm) ? 3 : 1, transition: 'all 0.3s ease', minWidth: '320px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
            <h3 style={{margin: 0, fontSize: '1.25rem'}}>Active Orders Queue</h3>
            <button
              onClick={() => {
                setShowCreateForm(true);
                setSelectedOrderId(null);
              }}
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              <Plus size={16} /> New Order
            </button>
          </div>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Priority</th>
                  <th>SKU</th>
                  <th>Stage</th>
                  <th style={{textAlign: 'right'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.slice(0, 30).map((order, i) => {
                  const stage = getOrderStage(order);
                  const isSelected = selectedOrderId === order.Order_ID;

                  return (
                    <tr 
                      key={i} 
                      onClick={() => {
                        setSelectedOrderId(order.Order_ID);
                        setShowCreateForm(false);
                      }}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{fontWeight: 500, color: 'var(--primary-hover)'}}>{order.Order_ID}</td>
                      <td>
                        <span className={`badge ${order.Order_Priority === 'Critical' ? 'badge-danger' : order.Order_Priority === 'High' ? 'badge-warning' : 'badge-info'}`}>
                          {order.Order_Priority}
                        </span>
                      </td>
                      <td><code>{order.SKU}</code></td>
                      <td>
                        <span className={`badge ${
                          stage === 'Dispatched' ? 'badge-success' : 
                          stage === 'QA Passed' ? 'badge-success' :
                          stage === 'QA Hold' ? 'badge-danger' : 'badge-info'
                        }`}>{stage}</span>
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrderId(order.Order_ID);
                            setShowCreateForm(false);
                          }}
                          style={{
                            background: 'var(--bg-soft)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-main)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {activeOrders.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{textAlign: 'center', color: 'var(--text-muted)'}}>No active pending orders. All fulfilled!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dynamic Right Panel: Order Inspector OR Creation Form */}
        <AnimatePresence mode="wait">
          {showCreateForm && (
            <motion.div
              key="create-form"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="glass-card"
              style={{flex: 2, minWidth: '300px', borderLeft: '1px solid var(--secondary)'}}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h3 style={{fontSize: '1.2rem', margin: 0}}>Create New Order</h3>
                <button 
                  onClick={() => setShowCreateForm(false)}
                  style={{background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'}}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateOrder} style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600}}>Select Product / SKU</label>
                  <select 
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    style={{background: 'var(--bg-soft)', border: '1px solid var(--border)', padding: '10px', borderRadius: '8px', color: 'var(--text-main)', outline: 'none'}}
                  >
                    {Object.entries(PRODUCT_CATALOG).map(([sku, name]) => (
                      <option key={sku} value={sku} style={{background: 'var(--bg-card)', color: 'var(--text-main)'}}>{sku} - {name}</option>
                    ))}
                  </select>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600}}>Quantity</label>
                  <input 
                    type="number"
                    value={formQty}
                    onChange={(e) => setFormQty(Math.max(1, parseInt(e.target.value, 10)))}
                    style={{background: 'var(--bg-soft)', border: '1px solid var(--border)', padding: '10px', borderRadius: '8px', color: 'var(--text-main)', outline: 'none'}}
                    required
                  />
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600}}>Fulfillment Priority</label>
                  <select 
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    style={{background: 'var(--bg-soft)', border: '1px solid var(--border)', padding: '10px', borderRadius: '8px', color: 'var(--text-main)', outline: 'none'}}
                  >
                    <option value="Critical" style={{background: 'var(--bg-card)', color: 'var(--text-main)'}}>Critical</option>
                    <option value="High" style={{background: 'var(--bg-card)', color: 'var(--text-main)'}}>High</option>
                    <option value="Medium" style={{background: 'var(--bg-card)', color: 'var(--text-main)'}}>Medium</option>
                    <option value="Low" style={{background: 'var(--bg-card)', color: 'var(--text-main)'}}>Low</option>
                  </select>
                </div>

                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                    border: 'none',
                    color: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginTop: '12px'
                  }}
                >
                  Create Order Record
                </button>
              </form>
            </motion.div>
          )}

          {selectedOrder && (
            <motion.div 
              key="inspector"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="glass-card" 
              style={{flex: 2, minWidth: '300px', borderLeft: '1px solid var(--primary)'}}
            >
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                <h3 style={{fontSize: '1.2rem', margin: 0}}>Order Inspector</h3>
                <button 
                  onClick={() => setSelectedOrderId(null)}
                  style={{background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'}}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{marginBottom: '24px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                  <span style={{fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary-hover)'}}>#{selectedOrder.Order_ID}</span>
                  <span className={`badge ${selectedOrder.Order_Priority === 'Critical' ? 'badge-danger' : selectedOrder.Order_Priority === 'High' ? 'badge-warning' : 'badge-info'}`}>{selectedOrder.Order_Priority}</span>
                </div>
                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{selectedOrder.Product_Name}</div>
                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Carrier: **{selectedOrder.Carrier || 'N/A'}**</div>
              </div>

              {/* Stepper Timeline */}
              <div style={{display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '24px', marginBottom: '32px'}}>
                <div style={{
                  position: 'absolute',
                  left: '7px',
                  top: '8px',
                  bottom: '8px',
                  width: '2px',
                  background: 'rgba(255,255,255,0.1)'
                }} />

                {LIFECYCLE_STAGES.map((stage, idx) => {
                  const currentStageIdx = LIFECYCLE_STAGES.indexOf(currentStage);
                  const isCurrent = currentStage === stage || (stage === 'QA Passed' && currentStage === 'QA Hold');
                  const isCompleted = idx < currentStageIdx || (currentStageIdx === -1 && currentStage === 'Dispatched');
                  
                  return (
                    <div key={idx} style={{display: 'flex', alignItems: 'center', gap: '12px', position: 'relative'}}>
                      <div style={{
                        position: 'absolute',
                        left: '-23px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: isCompleted ? 'var(--success)' : isCurrent ? 'var(--primary)' : '#475569',
                        boxShadow: isCurrent ? '0 0 10px var(--primary)' : 'none',
                        border: '2px solid var(--bg-surface)',
                        zIndex: 2
                      }} />
                      
                      <div style={{display: 'flex', flexDirection: 'column'}}>
                        <span style={{
                          fontSize: '0.85rem', 
                          fontWeight: isCurrent ? 600 : 500,
                          color: isCompleted ? 'var(--success)' : isCurrent ? 'var(--text-main)' : 'var(--text-muted)'
                        }}>
                          {stage}
                          {stage === 'QA Passed' && currentStage === 'QA Hold' && (
                            <span style={{color: 'var(--danger)', marginLeft: '8px'}}>(QA Hold - Damaged)</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Advance Action Button */}
              {nextAction && (
                <button
                  onClick={handleAdvanceStage}
                  style={{
                    width: '100%',
                    background: nextAction.action === 'resolve_qa' ? 'var(--danger)' : 'linear-gradient(135deg, var(--primary), var(--secondary))',
                    border: 'none',
                    color: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontWeight: 600,
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.2)'
                  }}
                >
                  {nextAction.label}
                  <ArrowRight size={16} />
                </button>
              )}
              {!nextAction && (
                <div style={{
                  padding: '12px',
                  background: 'rgba(16,185,129,0.1)',
                  color: 'var(--success)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}>
                  ✅ Lifecycle Complete (Order Dispatched)
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
