import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Package, Search } from 'lucide-react';

export default function InventoryMonitoring({ orders, searchQuery = '' }) {
  // Aggregate inventory by SKU based on the live orders dataset filtered by query
  const inventoryBySku = useMemo(() => {
    const map = {};
    orders.forEach(o => {
      if (!map[o.SKU]) {
        map[o.SKU] = {
          sku: o.SKU,
          name: o.Product_Name,
          stock: o.Total_Inventory_On_Hand,
          reserved: o.Total_Reserved,
          available: o.Total_Available,
          status: 'healthy'
        };
      }
    });

    let items = Object.values(map);
    items.forEach(item => {
      if (item.stock === 0) item.status = 'out';
      else if (item.available <= 10) item.status = 'critical';
      else if (item.available <= 50) item.status = 'low';
    });
    
    if (searchQuery) {
      items = items.filter(item => 
        (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    return items.sort((a, b) => a.available - b.available);
  }, [orders, searchQuery]);

  const outOfStock = inventoryBySku.filter(i => i.status === 'out').length;
  const lowStock = inventoryBySku.filter(i => i.status === 'low' || i.status === 'critical').length;
  const healthy = inventoryBySku.filter(i => i.status === 'healthy').length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <header className="page-header">
        <h1 className="page-title">Inventory & Stock Monitoring</h1>
        <p className="page-subtitle">Real-time inventory levels, low-stock, and out-of-stock detection</p>
      </header>

      <div className="grid-3" style={{marginBottom: '32px'}}>
        <div className="glass-card" style={{borderLeft: '4px solid var(--danger)'}}>
          <h3 style={{color: 'var(--text-muted)'}}>OUT OF STOCK</h3>
          <div className="metric-value">{outOfStock} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>SKUs</span></div>
        </div>
        <div className="glass-card" style={{borderLeft: '4px solid var(--warning)'}}>
          <h3 style={{color: 'var(--text-muted)'}}>LOW STOCK WARNINGS</h3>
          <div className="metric-value">{lowStock} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>SKUs</span></div>
        </div>
        <div className="glass-card" style={{borderLeft: '4px solid var(--success)'}}>
          <h3 style={{color: 'var(--text-muted)'}}>HEALTHY ITEMS</h3>
          <div className="metric-value">{healthy} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>SKUs</span></div>
        </div>
      </div>

      <div className="glass-card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
          <h3 style={{fontSize: '1.25rem'}}>Stock Level Alerts</h3>
          <div style={{display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: '8px', alignItems: 'center'}}>
            <Search size={16} color="var(--text-muted)" />
            <input type="text" placeholder="Search SKU..." style={{background: 'transparent', border: 'none', color: 'white', outline: 'none'}} />
          </div>
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Total Stock</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inventoryBySku.map((item, i) => (
                <tr key={i}>
                  <td style={{fontWeight: 500}}>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.stock}</td>
                  <td>{item.reserved}</td>
                  <td>{item.available}</td>
                  <td>
                    {item.status === 'critical' && <span className="badge badge-danger" style={{display: 'flex', alignItems: 'center', gap: '4px', width: 'max-content'}}><AlertTriangle size={14}/> Critical</span>}
                    {item.status === 'low' && <span className="badge badge-warning">Low Stock</span>}
                    {item.status === 'healthy' && <span className="badge badge-success">Healthy</span>}
                    {item.status === 'out' && <span className="badge badge-danger">Out of Stock</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
