import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { HardHat, ShieldAlert, CheckSquare } from 'lucide-react';

export default function WarehouseOperations({ orders = [], updateOrder, searchQuery = '' }) {
  // Aggregate real warehouse operations from orders filtered by query
  const { damagedItems, activeTasks, completedCount, avgTime } = useMemo(() => {
    let damaged = [];
    let tasks = [];
    let cCount = 0;
    let totalMins = 0;
    let timeEntries = 0;

    orders.forEach(o => {
      const isDispatched = o.Dispatch_Status === 'Dispatched';
      const matchesSearch = !searchQuery || 
        (o.Order_ID && o.Order_ID.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.Product_Name && o.Product_Name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.SKU && o.SKU.toLowerCase().includes(searchQuery.toLowerCase()));

      // Collect active damaged items log (only for pending/active orders)
      if (o.Damaged_Items > 0 && !isDispatched && matchesSearch) {
        damaged.push({
          id: o.Order_ID || o.id,
          sku: o.SKU,
          name: o.Product_Name,
          issue: `${o.Damaged_Items} units damaged`,
          reportedAt: o.Picking_End ? new Date(o.Picking_End).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'}) : 'QA Check',
          status: 'Reviewing'
        });
      }

      // Collect active pick/pack floor tasks
      if (!isDispatched && matchesSearch) {
        const isPicked = o.Quantity_Picked >= o.Order_Quantity;
        tasks.push({
          zone: `WH-${o.Warehouse_ID}`,
          task: isPicked ? 'Packing' : 'Picking',
          order: o.Order_ID || o.id,
          operator: 'System Assigned',
          status: isPicked 
            ? (o.Packing_Status === 'Partial' ? 'In Progress' : 'Pending') 
            : (o.Quantity_Picked > 0 ? 'In Progress' : 'Pending')
        });
      } else if (isDispatched) {
        cCount++;
      }

      if (o.Processing_Time_Minutes) {
        totalMins += o.Processing_Time_Minutes;
        timeEntries++;
      }
    });

    return { 
      damagedItems: damaged, 
      activeTasks: tasks.slice(0, 15), // Limit UI list size
      completedCount: cCount,
      avgTime: timeEntries > 0 ? Math.round(totalMins / timeEntries) : 0
    };
  }, [orders]);

  const handleResolveDamage = async (orderId) => {
    // Clear damaged items from the order
    await updateOrder(orderId, { Damaged_Items: 0 });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <header className="page-header">
        <h1 className="page-title">Picking, Packing & QA</h1>
        <p className="page-subtitle">Floor operations, task assignments, and damaged item handling</p>
      </header>

      <div className="grid-3" style={{marginBottom: '32px'}}>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>ACTIVE FLOOR TASKS</h3>
          <div className="metric-value">{activeTasks.length}</div>
        </div>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>AVG PROCESSING TIME</h3>
          <div className="metric-value">{avgTime} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>mins</span></div>
        </div>
        <div className="glass-card" style={{borderLeft: '4px solid var(--danger)'}}>
          <h3 style={{color: 'var(--text-muted)'}}>DAMAGED ITEMS LOGGED</h3>
          <div className="metric-value" style={{color: 'var(--danger)'}}>{damagedItems.length}</div>
        </div>
      </div>

      <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap'}}>
        <div className="glass-card" style={{flex: 2, minWidth: '320px'}}>
          <h3 style={{marginBottom: '16px', fontSize: '1.25rem'}}>Active Floor Tasks</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Task Type</th>
                  <th>Order Ref</th>
                  <th>Operator</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeTasks.map((task, i) => (
                  <tr key={i}>
                    <td><strong>{task.zone}</strong></td>
                    <td>{task.task}</td>
                    <td style={{color: 'var(--primary-hover)'}}>{task.order}</td>
                    <td>{task.operator}</td>
                    <td>
                      <span className={`badge ${task.status === 'Completed' ? 'badge-success' : task.status === 'In Progress' ? 'badge-info' : 'badge-warning'}`}>
                        {task.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {activeTasks.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{textAlign: 'center', color: 'var(--text-muted)'}}>No active floor tasks. All dispatched!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card" style={{flex: 1, minWidth: '280px'}}>
          <h3 style={{marginBottom: '16px', fontSize: '1.25rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <ShieldAlert size={20} /> QA / Damaged Items
          </h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {damagedItems.map((item, i) => (
              <div key={i} style={{background: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '12px', borderLeft: '3px solid var(--danger)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                  <strong>{item.sku}</strong>
                  <span style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{item.reportedAt}</span>
                </div>
                <div style={{fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '4px'}}>{item.name}</div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px'}}>Issue: {item.issue}</div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span className="badge badge-danger">{item.status}</span>
                  <button 
                    onClick={() => handleResolveDamage(item.id)}
                    style={{
                      background: 'rgba(255,255,255,0.1)', 
                      border: 'none', 
                      color: 'var(--success)', 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem', 
                      cursor: 'pointer'
                    }}
                  >
                    Resolve Damage
                  </button>
                </div>
              </div>
            ))}
            {damagedItems.length === 0 && (
              <div style={{color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0'}}>
                <CheckSquare size={32} style={{color: 'var(--success)', marginBottom: '8px'}} />
                <p>No active damage reports. Quality check clear!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
