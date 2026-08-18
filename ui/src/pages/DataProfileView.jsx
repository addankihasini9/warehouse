import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Check, Info } from 'lucide-react';

export default function DataProfileView({ metadata, updateMetadata }) {
  const dataProfile = metadata?.data_profile || {};
  
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('numeric');
  const [newColMissing, setNewColMissing] = useState('0');
  const [newColUnique, setNewColUnique] = useState('1');

  if (!dataProfile.columns) return <div style={{ color: 'var(--text-muted)', padding: '24px' }}>No data profile found</div>;

  const handleAddColumn = (e) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const newCol = {
      column: newColName.trim(),
      detected_type: newColType,
      missing_pct: parseFloat(newColMissing) || 0,
      unique_non_null: parseInt(newColUnique, 10) || 1
    };

    const updatedColumns = [...dataProfile.columns, newCol];
    const updatedProfile = {
      ...dataProfile,
      columns: updatedColumns
    };

    updateMetadata({ data_profile: updatedProfile });

    // Clear inputs
    setNewColName('');
    setNewColMissing('0');
    setNewColUnique('1');
  };

  // Stagger Animations for columns & page elements
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}
    >
      <motion.header variants={cardVariants} className="page-header">
        <h1 className="page-title" style={{ fontSize: '1.85rem' }}>Dataset Profile</h1>
        <p className="page-subtitle" style={{ fontSize: '0.85rem' }}>File: {dataProfile.file_path ? dataProfile.file_path.split('/').pop() : 'warehouse_orders.csv'}</p>
      </motion.header>

      {/* KPI stats section */}
      <motion.div variants={cardVariants} className="grid-3">
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Categorical Fields</h3>
          <div className="metric-value" style={{color: 'var(--primary)'}}>{dataProfile.categorical_columns ? dataProfile.categorical_columns.length : 0}</div>
        </div>
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Numerical Fields</h3>
          <div className="metric-value" style={{color: 'var(--secondary)'}}>{dataProfile.numerical_columns ? dataProfile.numerical_columns.length : 0}</div>
        </div>
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Datetime Fields</h3>
          <div className="metric-value" style={{color: 'var(--warning)'}}>{dataProfile.datetime_columns ? dataProfile.datetime_columns.length : 0}</div>
        </div>
      </motion.div>

      {/* Table container & custom insertion form layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.5fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Side: Column Analysis Table */}
        <motion.div variants={cardVariants} className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{marginBottom: '16px', fontSize: '1.1rem', fontWeight: 800}}>Schema Column Definitions</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Column Name</th>
                  <th>Detected Type</th>
                  <th>Missing %</th>
                  <th>Unique Values</th>
                </tr>
              </thead>
              <tbody>
                {dataProfile.columns.map((col, i) => (
                  <motion.tr 
                    key={i}
                    variants={cardVariants}
                  >
                    <td style={{fontWeight: 700, color: 'var(--text-main)'}}>{col.column}</td>
                    <td>
                      <span className={`badge ${
                        col.detected_type.includes('categorical') ? 'badge-info' : 
                        col.detected_type.includes('numeric') ? 'badge-success' : 'badge-warning'
                      }`}>
                        {col.detected_type}
                      </span>
                    </td>
                    <td>
                      {col.missing_pct > 0 ? (
                        <span style={{color: 'var(--danger)', fontWeight: 700}}>{col.missing_pct}%</span>
                      ) : (
                        <span style={{color: 'var(--text-muted)'}}>0%</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{col.unique_non_null}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Right Side: Add Custom Data Option Form */}
        <motion.div variants={cardVariants} className="glass-card" style={{ padding: '24px', borderLeft: '1px solid var(--primary)' }}>
          <h3 style={{ marginBottom: '6px', fontSize: '1.1rem', fontWeight: 800 }}>Add Schema Column</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
            Append custom properties or metadata columns to the profile index catalog.
          </p>

          <form onSubmit={handleAddColumn} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Column Name</label>
              <input 
                type="text"
                placeholder="e.g. Storage_Temperature"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                style={{
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--border)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: '0.8rem'
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Data Type</label>
              <select 
                value={newColType}
                onChange={(e) => setNewColType(e.target.value)}
                style={{
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--border)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: '0.8rem'
                }}
              >
                <option value="numeric">numeric</option>
                <option value="categorical">categorical</option>
                <option value="datetime">datetime</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Missing Percentage (%)</label>
              <input 
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={newColMissing}
                onChange={(e) => setNewColMissing(e.target.value)}
                style={{
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--border)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Unique Values Count</label>
              <input 
                type="number"
                min="1"
                value={newColUnique}
                onChange={(e) => setNewColUnique(e.target.value)}
                style={{
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--border)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: '0.8rem'
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                border: 'none',
                color: 'white',
                padding: '10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.8rem',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(79, 70, 229, 0.2)'
              }}
            >
              <Plus size={14} />
              Add Column Definition
            </button>
          </form>
        </motion.div>

      </div>
    </motion.div>
  );
}
