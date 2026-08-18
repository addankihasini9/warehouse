import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Truck, MapPin } from 'lucide-react';

export default function FulfillmentTracking({ orders, searchQuery = '' }) {
  const stats = useMemo(() => {
    const dispatched = orders.filter(o => o.Dispatch_Status === 'Dispatched' || o.Dispatch_At);
    const pending = orders.filter(o => o.Dispatch_Status !== 'Dispatched' && !o.Dispatch_At);
    
    // Check for delay labels (can be "Yes", 1, true depending on preprocessing/sync)
    const delayedCount = dispatched.filter(o => 
      o.Delay_Risk_Label === 'Yes' || 
      o.Delay_Risk_Label === 1 || 
      o.Delay_Risk_Label === true ||
      o.Order_Delayed_Label === 'Yes' ||
      o.Order_Delayed_Label === 1 ||
      o.Order_Delayed_Label === true
    ).length;

    const onTimeRate = dispatched.length > 0 
      ? (((dispatched.length - delayedCount) / dispatched.length) * 100).toFixed(1)
      : '100.0';

    return {
      dispatchedCount: dispatched.length,
      pendingCount: pending.length,
      onTimeRate
    };
  }, [orders]);

  // List of active shipments filtered by search query
  const activeShipments = useMemo(() => {
    return orders
      .filter(o => 
        (o.Dispatch_Status === 'Dispatched' || o.Dispatch_At) &&
        (!searchQuery || 
          (o.Order_ID && o.Order_ID.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (o.Product_Name && o.Product_Name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (o.SKU && o.SKU.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (o.Carrier && o.Carrier.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      )
      .slice(0, 30); // show top 30
  }, [orders, searchQuery]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <header className="page-header">
        <h1 className="page-title">Fulfillment & Dispatch</h1>
        <p className="page-subtitle">Track outbound shipments and carrier performance from live database</p>
      </header>

      <div className="grid-3" style={{marginBottom: '32px'}}>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>TOTAL DISPATCHED</h3>
          <div className="metric-value">{stats.dispatchedCount}</div>
        </div>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>ON-TIME DELIVERY RATE</h3>
          <div className="metric-value" style={{color: 'var(--success)'}}>{stats.onTimeRate}%</div>
        </div>
        <div className="glass-card">
          <h3 style={{color: 'var(--text-muted)'}}>PENDING DISPATCH</h3>
          <div className="metric-value" style={{color: 'var(--warning)'}}>{stats.pendingCount}</div>
        </div>
      </div>

      <div className="glass-card">
        <h3 style={{marginBottom: '16px', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Truck size={20} /> Active Shipments
        </h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order Ref</th>
                <th>Carrier</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Est. Delivery</th>
              </tr>
            </thead>
            <tbody>
              {activeShipments.map((shipment, i) => {
                const isDelayed = 
                  shipment.Delay_Risk_Label === 'Yes' || 
                  shipment.Delay_Risk_Label === 1 || 
                  shipment.Delay_Risk_Label === true ||
                  shipment.Order_Delayed_Label === 'Yes' ||
                  shipment.Order_Delayed_Label === 1 ||
                  shipment.Order_Delayed_Label === true;

                const dateStr = shipment.Estimated_Delivery 
                  ? new Date(shipment.Estimated_Delivery).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) 
                  : 'N/A';

                return (
                  <tr key={i}>
                    <td style={{fontWeight: 500, color: 'var(--primary-hover)'}}>{shipment.Order_ID || shipment.id}</td>
                    <td>{shipment.Carrier || 'Unknown'}</td>
                    <td>
                      <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                        <MapPin size={14} color="var(--text-muted)"/> 
                        {shipment.Warehouse_City || 'Local WH'}
                      </span>
                    </td>
                    <td>
                      {isDelayed ? (
                        <span className="badge badge-danger">Delayed</span>
                      ) : (
                        <span className="badge badge-success">In Transit</span>
                      )}
                    </td>
                    <td style={{color: 'var(--text-muted)'}}>{dateStr}</td>
                  </tr>
                );
              })}
              {activeShipments.length === 0 && (
                <tr>
                  <td colSpan="5" style={{textAlign: 'center', color: 'var(--text-muted)'}}>No active shipments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
