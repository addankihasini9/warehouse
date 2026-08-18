import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ShieldAlert, Sparkles, Package, HelpCircle, Truck, Play, CheckCircle } from 'lucide-react';
import { 
  prioritizeOrders, allocateInventory, recommendReorders, 
  resolveShortageException, auditExceptions 
} from '../utils/decisionEngine';

export default function DecisionEngineView({ orders = [], updateOrder }) {
  const [activeSubTab, setActiveSubTab] = useState('exceptions');
  const [selectedExceptionId, setSelectedExceptionId] = useState(null);

  // Audited calculations
  const exceptions = useMemo(() => auditExceptions(orders), [orders]);
  const priorities = useMemo(() => prioritizeOrders(orders), [orders]);
  const reorders = useMemo(() => recommendReorders(orders), [orders]);

  const selectedException = useMemo(() => {
    return exceptions.find(e => e.id === selectedExceptionId);
  }, [exceptions, selectedExceptionId]);

  const reallocationPlan = useMemo(() => {
    if (!selectedException || selectedException.actionType !== 'resolve_shortage') return null;
    const targetOrder = orders.find(o => o.Order_ID === selectedException.payload.orderId);
    return resolveShortageException(targetOrder, orders);
  }, [orders, selectedException]);

  const handleResolveException = async (exc) => {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const { actionType, payload } = exc;

    try {
      if (actionType === 'resolve_shortage') {
        const plan = reallocationPlan;
        if (plan && plan.transfers.length > 0) {
          let transferred = 0;
          for (const t of plan.transfers) {
            await updateOrder(t.donorOrderId, { 
              Quantity_Allocated: Math.max(0, t.currentAllocated - t.quantityToTake) 
            });
            transferred += t.quantityToTake;
          }
          const target = orders.find(o => o.Order_ID === plan.targetOrderId);
          if (target) {
            await updateOrder(plan.targetOrderId, {
              Quantity_Allocated: (target.Quantity_Allocated || 0) + transferred
            });
          }
        } else {
          // Fallback: trigger emergency procurement
          await handleRestock(payload.sku, payload.gap * 2);
        }
      } 
      
      else if (actionType === 'restock_sku') {
        await handleRestock(payload.sku, payload.quantity);
      } 
      
      else if (actionType === 'replace_damaged') {
        await updateOrder(payload.orderId, { Damaged_Items: 0 });
      } 
      
      else if (actionType === 'reconcile_missing') {
        const target = orders.find(o => o.Order_ID === payload.orderId);
        if (target) {
          await updateOrder(payload.orderId, { Quantity_Picked: target.Quantity_Allocated });
        }
      } 
      
      else if (actionType === 'escalate_picking') {
        const target = orders.find(o => o.Order_ID === payload.orderId);
        if (target) {
          await updateOrder(payload.orderId, { 
            Quantity_Picked: target.Order_Quantity,
            Picking_End: nowStr
          });
        }
      } 
      
      else if (actionType === 'expedite_packing') {
        await updateOrder(payload.orderId, { 
          Packing_Status: 'Packed',
          Packing_End: nowStr
        });
      } 
      
      else if (actionType === 'swap_carrier') {
        await updateOrder(payload.orderId, { 
          Carrier: 'Blue Dart',
          Dispatch_Status: 'Dispatched',
          Dispatch_At: nowStr
        });
      }

      setSelectedExceptionId(null);
    } catch (err) {
      console.error("Resolution failed:", err);
    }
  };

  const handleRestock = async (sku, quantity) => {
    const sameSkuOrders = orders.filter(o => o.SKU === sku);
    for (const order of sameSkuOrders) {
      await updateOrder(order.Order_ID || order.id, {
        Total_Inventory_On_Hand: (order.Total_Inventory_On_Hand || 0) + quantity,
        Total_Available: (order.Total_Available || 0) + quantity
      });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--secondary), var(--primary))',
          padding: '8px',
          borderRadius: '12px'
        }}>
          <Brain size={24} color="white" />
        </div>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Decision Engine & Analytics</h1>
          <p className="page-subtitle">Deterministic prioritized queues, safety margin audits, and exception resolutions</p>
        </div>
      </header>

      {/* Selector Navigation */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <button 
          onClick={() => setActiveSubTab('exceptions')}
          className={`nav-item ${activeSubTab === 'exceptions' ? 'active' : ''}`}
          style={{ background: 'transparent', border: 'none', padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          Resolution Center ({exceptions.length})
        </button>
        <button 
          onClick={() => setActiveSubTab('priorities')}
          className={`nav-item ${activeSubTab === 'priorities' ? 'active' : ''}`}
          style={{ background: 'transparent', border: 'none', padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          Priority Queue ({priorities.length})
        </button>
        <button 
          onClick={() => setActiveSubTab('reorders')}
          className={`nav-item ${activeSubTab === 'reorders' ? 'active' : ''}`}
          style={{ background: 'transparent', border: 'none', padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          Safety Stock Reorders ({reorders.filter(r => r.status !== 'Healthy').length})
        </button>
      </div>

      {/* Render Sub Tabs */}
      <div>
        {/* TAB 1: EXCEPTION RESOLUTION CENTER */}
        {activeSubTab === 'exceptions' && (
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="glass-card" style={{ flex: selectedException ? 3 : 1, minWidth: '320px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} color="var(--danger)" /> Active Exceptions Log
              </h3>
              
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Exception Category</th>
                      <th>Scope</th>
                      <th>Message</th>
                      <th style={{ textAlign: 'right' }}>Resolve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((exc, i) => (
                      <tr 
                        key={i}
                        onClick={() => setSelectedExceptionId(exc.id)}
                        style={{
                          cursor: 'pointer',
                          background: selectedExceptionId === exc.id ? 'rgba(255, 255, 255, 0.04)' : 'transparent'
                        }}
                      >
                        <td>
                          <span className={`badge ${
                            exc.type.includes('Stock') ? 'badge-danger' : 
                            exc.type.includes('Damaged') ? 'badge-danger' : 'badge-warning'
                          }`}>
                            {exc.type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--primary-hover)' }}>
                          {exc.orderId ? `Order #${exc.orderId}` : `SKU ${exc.sku}`}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {exc.message}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolveException(exc);
                            }}
                            style={{
                              background: 'var(--primary)',
                              border: 'none',
                              color: 'white',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                    {exceptions.length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                          ✅ All operations executing smoothly. No exceptions detected!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sidebar Inspector Panel */}
            <AnimatePresence>
              {selectedException && (
                <motion.div 
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="glass-card" 
                  style={{ flex: 2, minWidth: '280px', borderLeft: '1px solid var(--danger)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Decision Blueprint</h3>
                    <button 
                      onClick={() => setSelectedExceptionId(null)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      Close
                    </button>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Exception Category</div>
                    <div style={{ fontWeight: 600, color: 'var(--danger)', fontSize: '1rem', marginTop: '4px' }}>{selectedException.type}</div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Factual Message</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '4px' }}>{selectedException.message}</div>
                  </div>

                  <div style={{ marginBottom: '24px', padding: '12px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-hover)', fontWeight: 600, textTransform: 'uppercase' }}>Recommended Decision</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '4px', lineHeight: 1.4 }}>{selectedException.decision}</div>
                  </div>

                  {selectedException.actionType === 'resolve_shortage' && reallocationPlan && reallocationPlan.transfers.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Reallocation Transfers</div>
                      {reallocationPlan.transfers.map((t, idx) => (
                        <div key={idx} style={{ padding: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', fontSize: '0.75rem', marginBottom: '4px' }}>
                          Take **{t.quantityToTake}** from Order **#{t.donorOrderId}** ({t.donorPriority})
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => handleResolveException(selectedException)}
                    style={{
                      width: '100%',
                      background: 'var(--primary)',
                      border: 'none',
                      color: 'white',
                      padding: '10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Execute Resolution
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* TAB 2: PRIORITY QUEUE VIEW */}
        {activeSubTab === 'priorities' && (
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Priority Ordered Fulfillment Queue</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Queue Pos</th>
                    <th>Order ID</th>
                    <th>Product</th>
                    <th>Priority</th>
                    <th>Created At</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {priorities.slice(0, 30).map((order, i) => (
                    <tr key={i}>
                      <td><strong>#{i + 1}</strong></td>
                      <td style={{ fontWeight: 500, color: 'var(--primary-hover)' }}>{order.Order_ID}</td>
                      <td>{order.Product_Name}</td>
                      <td>
                        <span className={`badge ${
                          order.Order_Priority === 'Critical' ? 'badge-danger' : 
                          order.Order_Priority === 'High' ? 'badge-warning' : 'badge-info'
                        }`}>{order.Order_Priority}</span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{order.Order_Created_At}</td>
                      <td>{order.Order_Quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SAFETY STOCK REORDERS */}
        {activeSubTab === 'reorders' && (
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Safety Stock & Restock Auditing</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Available Bal</th>
                    <th>Reorder Point (3d)</th>
                    <th>Safety Stock (7d)</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Replenish</th>
                  </tr>
                </thead>
                <tbody>
                  {reorders.map((item, i) => {
                    const isHealthy = item.status === 'Healthy';
                    return (
                      <tr key={i}>
                        <td><code>{item.sku}</code></td>
                        <td>{item.name}</td>
                        <td style={{ fontWeight: 600 }}>{item.available}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{item.reorderPoint.toFixed(1)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{item.safetyStock.toFixed(1)}</td>
                        <td>
                          <span className={`badge ${
                            item.status === 'Critical' ? 'badge-danger' : 
                            item.status === 'Warning' ? 'badge-warning' : 'badge-success'
                          }`}>{item.status}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {!isHealthy && (
                            <button
                              onClick={() => handleRestock(item.sku, item.recommendedOrderQty)}
                              style={{
                                background: 'rgba(16,185,129,0.1)',
                                border: '1px solid var(--success)',
                                color: 'var(--success)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                            >
                              Order +{item.recommendedOrderQty}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
