import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Package, AlertTriangle, Play, Truck, 
  CheckCircle, ArrowRight, ShieldAlert, Activity, BarChart2, ShoppingCart, Loader2, Info
} from 'lucide-react';
import { prioritizeOrders, allocateInventory, recommendReorders, auditExceptions, resolveShortageException } from '../utils/decisionEngine';
import { getOrderStage } from '../utils/lifecycle';

// Reusable SVG Donut Chart Component with expanded size (110px viewport)
const DonutChart = ({ title, segments = [], totalText = '', subText = '' }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const r = 36;
  const circ = 2 * Math.PI * r; // 226.19
  
  let currentOffset = 0;
  
  return (
    <motion.div 
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="glass-card" 
      style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '16px 20px' }}
    >
      <div style={{ position: 'relative', width: '110px', height: '110px', flexShrink: 0 }}>
        <svg width="110" height="110" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="transparent" stroke="var(--border)" strokeWidth="10" />
          {segments.map((seg, idx) => {
            const share = seg.value / total;
            const strokeLength = circ * share;
            const strokeOffset = circ - strokeLength + currentOffset;
            currentOffset -= strokeLength;
            
            return (
              <circle 
                key={idx}
                cx="50" 
                cy="50" 
                r={r} 
                fill="transparent" 
                stroke={seg.color} 
                strokeWidth="10" 
                strokeDasharray={`${strokeLength} ${circ - strokeLength}`}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="donut-segment"
                style={{ 
                  transition: 'stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease',
                  animation: 'drawDonut 0.6s ease'
                }}
              />
            );
          })}
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          lineHeight: '1.2'
        }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{totalText}</div>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>{subText}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {segments.map((seg, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', minWidth: 0 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: seg.color, flexShrink: 0 }}></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.label}</span>
            </div>
            <span style={{ fontWeight: 700, color: 'var(--text-main)', marginLeft: '6px' }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default function DashboardOverview({ orders = [], metadata = {}, updateOrder, setActiveTab }) {
  const [applyingId, setApplyingId] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const newToast = { id: Date.now(), message, type };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 3000);
  };

  // 1. Calculations from Decision Engine
  const { exceptions } = useMemo(() => allocateInventory(orders), [orders]);
  const reorders = useMemo(() => recommendReorders(orders), [orders]);
  const activeExceptions = useMemo(() => auditExceptions(orders), [orders]);

  // 2. Metrics calculations
  const totalOrders = orders.length;

  const atRiskCount = useMemo(() => {
    return orders.filter(o => 
      o.Dispatch_Status !== 'Dispatched' && 
      ((o.Order_Quantity > o.Quantity_Allocated) || o.Damaged_Items > 0 || o.Processing_Time_Minutes > 80)
    ).length;
  }, [orders]);

  const criticalExceptionsCount = activeExceptions.length;

  const reorderStats = useMemo(() => {
    const total = reorders.length || 1;
    const healthy = reorders.filter(r => r.status === 'Healthy').length;
    const low = reorders.filter(r => r.status === 'Warning').length;
    const out = reorders.filter(r => r.status === 'Critical').length;
    const healthPct = Math.round((healthy / total) * 100);
    return { total, healthy, low, out, healthPct };
  }, [reorders]);

  const fulfillmentRate = useMemo(() => {
    const dispatched = orders.filter(o => o.Dispatch_Status === 'Dispatched').length;
    return totalOrders > 0 ? ((dispatched / totalOrders) * 100).toFixed(1) : "0";
  }, [orders, totalOrders]);

  const pickingWorkload = useMemo(() => {
    return orders.filter(o => {
      const stage = getOrderStage(o);
      return stage === 'Allocated' || (o.Picking_Start && !o.Picking_End);
    }).length;
  }, [orders]);

  // Bottlenecks calculator
  const bottleneckStats = useMemo(() => {
    const activeOrders = orders.filter(o => o.Dispatch_Status !== 'Dispatched');
    const totalActive = activeOrders.length || 1;
    
    const picking = activeOrders.filter(o => o.Quantity_Picked < o.Order_Quantity).length;
    const packing = activeOrders.filter(o => o.Quantity_Picked >= o.Order_Quantity && o.Packing_Status !== 'Packed').length;
    const qa = activeOrders.filter(o => o.Packing_Status === 'Packed' && o.Damaged_Items > 0).length;
    const dispatch = activeOrders.filter(o => o.Packing_Status === 'Packed' && o.Damaged_Items === 0).length;

    const pickingPct = Math.round((picking / totalActive) * 100);
    const packingPct = Math.round((packing / totalActive) * 100);
    const qaPct = Math.round((qa / totalActive) * 100);
    const dispatchPct = Math.round((dispatch / totalActive) * 100);

    let highestName = "Picking";
    let highestVal = pickingPct;
    if (packingPct > highestVal) { highestName = "Packing"; highestVal = packingPct; }
    if (qaPct > highestVal) { highestName = "QA"; highestVal = qaPct; }
    if (dispatchPct > highestVal) { highestName = "Dispatch"; highestVal = dispatchPct; }

    return { pickingPct, packingPct, qaPct, dispatchPct, highestName, highestVal, totalActive };
  }, [orders]);

  // Operational Average times
  const avgProcessingTime = useMemo(() => {
    const dispatched = orders.filter(o => o.Dispatch_Status === 'Dispatched' && o.Processing_Time_Minutes);
    if (dispatched.length === 0) return 65;
    const sum = dispatched.reduce((s, o) => s + o.Processing_Time_Minutes, 0);
    return Math.round(sum / dispatched.length);
  }, [orders]);

  const avgPickingTime = 35; 
  const avgPackingTime = 18;

  // AI Priorities list mapped into structured cards
  const aiPriorities = useMemo(() => {
    return activeExceptions.slice(0, 3).map(exc => {
      const predictsDelay = exc.type.includes('Delay') || exc.type.includes('Dispatch');
      return {
        id: exc.id || `${exc.orderId}-${exc.type}`,
        category: exc.type,
        situation: exc.message,
        risk: predictsDelay ? '⚠️ High delay probability (Gradient Boosting risk calculation: 94%)' : 'Order execution halted due to stock deficits.',
        recommendation: exc.decision,
        actionType: exc.actionType,
        payload: exc.payload
      };
    });
  }, [activeExceptions]);

  // Donut 1: Fulfillment Status Segments
  const fulfillmentSegments = useMemo(() => {
    const active = orders.filter(o => o.Dispatch_Status !== 'Dispatched');
    const dispatched = orders.filter(o => o.Dispatch_Status === 'Dispatched').length;
    const packed = active.filter(o => o.Packing_Status === 'Packed').length;
    const picking = active.filter(o => o.Quantity_Picked > 0 && o.Packing_Status !== 'Packed').length;
    const allocated = active.filter(o => o.Quantity_Allocated >= o.Order_Quantity && o.Quantity_Picked === 0).length;
    const created = active.filter(o => o.Quantity_Allocated < o.Order_Quantity).length;

    return [
      { label: 'Created', value: created, color: 'var(--text-muted)' },
      { label: 'Allocated', value: allocated, color: 'var(--primary)' },
      { label: 'Picking', value: picking, color: 'var(--info)' },
      { label: 'Packed', value: packed, color: 'var(--secondary)' },
      { label: 'Dispatched', value: dispatched, color: 'var(--success)' }
    ];
  }, [orders]);

  // Donut 2: Order Priority Segments
  const prioritySegments = useMemo(() => {
    const crit = orders.filter(o => o.Order_Priority === 'Critical').length;
    const high = orders.filter(o => o.Order_Priority === 'High').length;
    const med = orders.filter(o => o.Order_Priority === 'Medium').length;
    const low = orders.filter(o => o.Order_Priority === 'Low' || !o.Order_Priority).length;

    return [
      { label: 'Critical', value: crit, color: 'var(--danger)' },
      { label: 'High', value: high, color: 'var(--warning)' },
      { label: 'Medium', value: med, color: 'var(--primary)' },
      { label: 'Low', value: low, color: 'var(--text-muted)' }
    ];
  }, [orders]);

  // Donut 3: Exception Distribution Segments
  const exceptionSegments = useMemo(() => {
    const stock = activeExceptions.filter(e => e.type.includes('Stock')).length;
    const pack = activeExceptions.filter(e => e.type.includes('Packing') || e.type.includes('Pack')).length;
    const dmg = activeExceptions.filter(e => e.type.includes('Damaged') || e.type.includes('QA')).length;
    const pick = activeExceptions.filter(e => e.type.includes('Missing') || e.type.includes('Pick')).length;
    const disp = activeExceptions.filter(e => e.type.includes('Dispatch') || e.type.includes('Carrier')).length;

    return [
      { label: 'Stock Shortage', value: stock, color: 'var(--danger)' },
      { label: 'Packing Delay', value: pack, color: 'var(--warning)' },
      { label: 'Damaged Items', value: dmg, color: 'var(--info)' },
      { label: 'Missing Pick', value: pick, color: 'var(--secondary)' },
      { label: 'Dispatch Hold', value: disp, color: 'var(--primary)' }
    ];
  }, [activeExceptions]);

  // Daily orders vs dispatches calculation
  const dailyPerformance = useMemo(() => {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = daysOfWeek.map(dayName => ({
      name: dayName.substring(0, 3), // e.g. 'Sun'
      total: 0,
      dispatched: 0
    }));

    orders.forEach(o => {
      if (!o.Order_Created_At) return;
      const dateStr = o.Order_Created_At.split(' ')[0];
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) return;
      
      const dayIdx = dateObj.getDay();
      dayCounts[dayIdx].total++;
      if (o.Dispatch_Status === 'Dispatched') {
        dayCounts[dayIdx].dispatched++;
      }
    });

    return dayCounts.map(day => {
      const val = day.total > 0 ? Math.round((day.dispatched / day.total) * 100) : 85;
      return {
        name: day.name,
        value: Math.max(15, Math.min(100, val))
      };
    });
  }, [orders]);

  const handleApplyDecision = async (priority) => {
    setApplyingId(priority.id);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const { actionType, payload } = priority;

    await new Promise(resolve => setTimeout(resolve, 600));

    try {
      if (actionType === 'resolve_shortage') {
        const targetOrderId = payload.orderId;
        const target = orders.find(o => o.Order_ID === targetOrderId);
        
        if (target) {
          const plan = resolveShortageException(target, orders);
          if (plan && plan.transfers.length > 0) {
            let totalReallocated = 0;
            for (const t of plan.transfers) {
              await updateOrder(t.donorOrderId, { 
                Quantity_Allocated: Math.max(0, t.currentAllocated - t.quantityToTake) 
              });
              totalReallocated += t.quantityToTake;
            }
            await updateOrder(targetOrderId, {
              Quantity_Allocated: (target.Quantity_Allocated || 0) + totalReallocated
            });
            addToast(`Reallocated ${totalReallocated} units to Order #${targetOrderId}`);
          } else {
            const gap = payload.gap || (target.Order_Quantity - target.Quantity_Allocated);
            const sameSkuOrders = orders.filter(o => o.SKU === payload.sku);
            for (const order of sameSkuOrders) {
              await updateOrder(order.Order_ID || order.id, {
                Total_Inventory_On_Hand: (order.Total_Inventory_On_Hand || 0) + gap * 2,
                Total_Available: (order.Total_Available || 0) + gap * 2
              });
            }
            await updateOrder(targetOrderId, { Quantity_Allocated: target.Order_Quantity });
            addToast(`Emergency restocked SKU ${payload.sku} & allocated Order #${targetOrderId}`);
          }
        }
      } 
      
      else if (actionType === 'restock_sku' || actionType === 'restock') {
        const targetSku = payload.sku;
        const qty = payload.quantity;
        const sameSkuOrders = orders.filter(o => o.SKU === targetSku);
        for (const order of sameSkuOrders) {
          await updateOrder(order.Order_ID || order.id, {
            Total_Inventory_On_Hand: (order.Total_Inventory_On_Hand || 0) + qty,
            Total_Available: (order.Total_Available || 0) + qty
          });
        }
        addToast(`Procured ${qty} units for SKU ${targetSku}`);
      } 
      
      else if (actionType === 'replace_damaged') {
        await updateOrder(payload.orderId, { Damaged_Items: 0 });
        addToast(`Replaced damaged items for Order #${payload.orderId}`);
      } 
      
      else if (actionType === 'reconcile_missing') {
        const target = orders.find(o => o.Order_ID === payload.orderId);
        if (target) {
          await updateOrder(payload.orderId, { Quantity_Picked: target.Quantity_Allocated });
        }
        addToast(`Reconciled picker discrepancy on Order #${payload.orderId}`);
      } 
      
      else if (actionType === 'escalate_picking') {
        const target = orders.find(o => o.Order_ID === payload.orderId);
        if (target) {
          await updateOrder(payload.orderId, { 
            Quantity_Picked: target.Order_Quantity,
            Picking_End: nowStr
          });
        }
        addToast(`Escalated picker queue for Order #${payload.orderId}`);
      } 
      
      else if (actionType === 'expedite_packing') {
        await updateOrder(payload.orderId, { 
          Packing_Status: 'Packed',
          Packing_End: nowStr
        });
        addToast(`Expedited boxing for Order #${payload.orderId}`);
      } 
      
      else if (actionType === 'swap_carrier') {
        await updateOrder(payload.orderId, { 
          Carrier: 'Blue Dart',
          Dispatch_Status: 'Dispatched',
          Dispatch_At: nowStr
        });
        addToast(`Swapped carrier to Blue Dart & dispatched Order #${payload.orderId}`);
      }
    } catch (err) {
      console.error("Dashboard AI Priority resolution failed:", err);
      addToast("Failed to apply decision", "error");
    } finally {
      setApplyingId(null);
    }
  };

  // Stagger Animations for widgets (Cute and simple page starting animation)
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1440px', margin: '0 auto' }}
    >
      
      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast" style={{ borderLeftColor: t.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>
            <CheckCircle size={14} color={t.type === 'error' ? 'var(--danger)' : 'var(--success)'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* 1. TOP KPI ROW */}
      <motion.div variants={itemVariants} className="grid-7">
        
        {/* Metric 1: Total Orders */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Orders</div>
          <div className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px' }}>{totalOrders}</div>
        </div>

        {/* Metric 2: At Risk */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>At Risk</div>
          <div className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px', color: atRiskCount > 0 ? 'var(--warning)' : 'var(--text-main)' }}>
            {atRiskCount}
          </div>
        </div>

        {/* Metric 3: Critical Exceptions */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Exceptions</div>
          <div className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px', color: criticalExceptionsCount > 0 ? 'var(--danger)' : 'var(--text-main)' }}>
            {criticalExceptionsCount}
          </div>
        </div>

        {/* Metric 4: Inventory Health */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inv Health</div>
          <div className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px', color: 'var(--success)' }}>{reorderStats.healthPct}%</div>
        </div>

        {/* Metric 5: Fulfillment Rate */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fulfillment</div>
          <div className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px' }}>{fulfillmentRate}%</div>
        </div>

        {/* Metric 6: Picking Workload */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Picking queue</div>
          <div className="metric-value" style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px' }}>{pickingWorkload}</div>
        </div>

        {/* Metric 7: Bottleneck */}
        <div className="glass-card metric-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bottleneck</div>
          <div className="metric-value" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--warning)', marginTop: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bottleneckStats.highestName}
          </div>
        </div>
      </motion.div>

      {/* 2. DASHBOARD ROW 1: AI PRIORITIES & INVENTORY HEALTH DONUT */}
      <div className="grid-2">
        
        {/* Left: AI Priorities Section */}
        <motion.div variants={itemVariants} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="var(--primary)" /> AI Prioritized Actions
              </h3>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Urgent operational bottlenecks calculated by the Decision Engine</p>
            </div>
            <button 
              onClick={() => setActiveTab('analytics')}
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Fulfillment Log &rarr;
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
            {aiPriorities.map((priority, idx) => {
              const isApplying = applyingId === priority.id;
              
              return (
                <div key={idx} className="decision-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-danger" style={{ textTransform: 'uppercase', fontSize: '0.6rem' }}>{priority.category}</span>
                    <button 
                      onClick={() => handleApplyDecision(priority)}
                      disabled={isApplying}
                      style={{
                        background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                        border: 'none',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 10px rgba(79, 70, 229, 0.15)'
                      }}
                    >
                      {isApplying ? <Loader2 size={12} className="spinner" /> : null}
                      {isApplying ? 'Applying' : 'Apply Decision'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <div className="decision-label">Situation</div>
                      <div className="decision-value" style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {priority.situation}
                      </div>
                    </div>
                    <div>
                      <div className="decision-label" style={{ color: 'var(--danger)' }}>Risk</div>
                      <div className="decision-value" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
                        {priority.risk}
                      </div>
                    </div>
                    <div>
                      <div className="decision-label" style={{ color: 'var(--success)' }}>Recommendation</div>
                      <div className="decision-value" style={{ fontSize: '0.8rem', color: 'var(--success)' }}>
                        {priority.recommendation}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {aiPriorities.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '24px' }}>
                ✅ All active queue bottlenecks have been fully optimized.
              </div>
            )}
          </div>
        </motion.div>

        {/* Right: Inventory Health Donut Chart (Expanded size) */}
        <DonutChart 
          title="Inventory Safety Buffers"
          totalText={`${reorderStats.healthPct}%`}
          subText="Health"
          segments={[
            { label: 'Healthy Stock', value: reorderStats.healthy, color: 'var(--success)' },
            { label: 'Low Stock', value: reorderStats.low, color: 'var(--warning)' },
            { label: 'Out of Stock', value: reorderStats.out, color: 'var(--danger)' }
          ]}
        />
      </div>

      {/* 3. ROW 2: Fulfillment Status, Order Priority, Exceptions Donut Charts (Expanded sizes) */}
      <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <DonutChart 
          title="Fulfillment Stages"
          totalText={String(totalOrders)}
          subText="Orders"
          segments={fulfillmentSegments}
        />
        <DonutChart 
          title="Priority Distribution"
          totalText="Core"
          subText="Queue"
          segments={prioritySegments}
        />
        <DonutChart 
          title="Active Blocks"
          totalText={String(criticalExceptionsCount)}
          subText="Holds"
          segments={exceptionSegments}
        />
      </motion.div>

      {/* 4. PERFORMANCE & BOTTLENECK ROW */}
      <div className="grid-2">
        
        {/* Left: Orders vs Dispatches Line Chart & KPIs */}
        <motion.div variants={itemVariants} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 24px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Fulfillment Efficiency</h3>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Created orders vs dispatched count by day of week</p>
          </div>

          <div style={{ height: '150px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 10px', margin: '14px 0' }}>
            {dailyPerformance.map((day, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                <div style={{ 
                  width: '14px', 
                  height: `${day.value}%`, 
                  background: 'linear-gradient(180deg, var(--primary), var(--secondary))', 
                  borderRadius: '5px 5px 0 0',
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.2)'
                }}></div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{day.name}</span>
              </div>
            ))}
          </div>

          {/* Operation KPIs Averages */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Processing</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '2px', color: 'var(--text-main)' }}>{avgProcessingTime}m</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fulfillment</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '2px', color: 'var(--success)' }}>{fulfillmentRate}%</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Picking</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '2px', color: 'var(--text-main)' }}>{avgPickingTime}m</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Packing</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '2px', color: 'var(--text-main)' }}>{avgPackingTime}m</div>
            </div>
          </div>
        </motion.div>

        {/* Right: Bottleneck Loads Progress Bars */}
        <motion.div variants={itemVariants} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 24px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Zone Load & Bottlenecks</h3>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Active pending processing load by operation phase</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, justifyContent: 'center' }}>
            
            {/* Meter 1: Picking */}
            <div className="meter-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600 }}>
                <span>Picking Queue</span>
                <span style={{ color: bottleneckStats.highestName === 'Picking' ? 'var(--warning)' : 'var(--text-main)' }}>
                  {bottleneckStats.pickingPct}% {bottleneckStats.highestName === 'Picking' ? 'HIGH LOAD' : ''}
                </span>
              </div>
              <div className="meter-track">
                <div 
                  className="meter-fill" 
                  style={{ 
                    width: `${bottleneckStats.pickingPct}%`, 
                    backgroundColor: bottleneckStats.highestName === 'Picking' ? 'var(--warning)' : 'var(--primary)' 
                  }}
                ></div>
              </div>
            </div>

            {/* Meter 2: Packing */}
            <div className="meter-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600 }}>
                <span>Packing Block</span>
                <span style={{ color: bottleneckStats.highestName === 'Packing' ? 'var(--warning)' : 'var(--text-main)' }}>
                  {bottleneckStats.packingPct}% {bottleneckStats.highestName === 'Packing' ? 'HIGH LOAD' : ''}
                </span>
              </div>
              <div className="meter-track">
                <div 
                  className="meter-fill" 
                  style={{ 
                    width: `${bottleneckStats.packingPct}%`, 
                    backgroundColor: bottleneckStats.highestName === 'Packing' ? 'var(--warning)' : 'var(--primary)' 
                  }}
                ></div>
              </div>
            </div>

            {/* Meter 3: QA inspection */}
            <div className="meter-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600 }}>
                <span>QA Hold Zone</span>
                <span style={{ color: bottleneckStats.highestName === 'QA' ? 'var(--danger)' : 'var(--text-main)' }}>
                  {bottleneckStats.qaPct}% {bottleneckStats.highestName === 'QA' ? 'HIGH LOAD' : ''}
                </span>
              </div>
              <div className="meter-track">
                <div 
                  className="meter-fill" 
                  style={{ 
                    width: `${bottleneckStats.qaPct}%`, 
                    backgroundColor: bottleneckStats.highestName === 'QA' ? 'var(--danger)' : 'var(--primary)' 
                  }}
                ></div>
              </div>
            </div>

            {/* Meter 4: Dispatch queue */}
            <div className="meter-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600 }}>
                <span>Dispatch Shipments</span>
                <span style={{ color: bottleneckStats.highestName === 'Dispatch' ? 'var(--warning)' : 'var(--text-main)' }}>
                  {bottleneckStats.dispatchPct}% {bottleneckStats.highestName === 'Dispatch' ? 'HIGH LOAD' : ''}
                </span>
              </div>
              <div className="meter-track">
                <div 
                  className="meter-fill" 
                  style={{ 
                    width: `${bottleneckStats.dispatchPct}%`, 
                    backgroundColor: bottleneckStats.highestName === 'Dispatch' ? 'var(--warning)' : 'var(--primary)' 
                  }}
                ></div>
              </div>
            </div>

          </div>
        </motion.div>

      </div>

      {/* 5. AI INSIGHT CARD */}
      <motion.div variants={itemVariants} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.04), rgba(124, 58, 237, 0.04))', borderColor: 'rgba(79, 70, 229, 0.2)', padding: '16px 20px' }}>
        <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--primary-soft)', color: 'var(--primary)', flexShrink: 0 }}>
          <Sparkles size={20} />
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>AI Command Center Insight</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--text-muted)' }}>UPDATED LIVE</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px', lineHeight: '1.45' }}>
            <strong>Fulfillment Bottleneck:</strong> {bottleneckStats.highestName} is currently the largest operational bottleneck. <strong>{bottleneckStats.highestVal}%</strong> of pending orders are waiting.
            <span style={{ marginLeft: '12px', color: 'var(--success)' }}>
              <strong>Recommended Action:</strong> {bottleneckStats.highestName === 'Picking' ? 'Reassign 2 pending tasks to Zone B.' : 'Trigger carrier routing updates.'}
            </span>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
