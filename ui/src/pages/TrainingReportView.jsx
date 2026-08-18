import React from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function TrainingReportView({ metadata }) {
  const trainingReport = metadata?.training_report || { task_reports: [] };
  const trainedModels = trainingReport.task_reports?.filter(t => t.status === 'trained') || [];


  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
    >
      <header className="page-header">
        <h1 className="page-title">ML Training Results</h1>
        <p className="page-subtitle">Detailed metrics and feature importances for trained models</p>
      </header>

      {trainedModels.map((report, index) => {
        const { task, metrics, model, top_features } = report;
        
        // Prepare chart data
        const chartData = top_features.slice(0, 5).map(f => ({
          name: f.feature.replace(/cat__|num__/, ''),
          importance: parseFloat((f.importance * 100).toFixed(2))
        }));

        return (
          <div key={index} className="glass-card" style={{marginBottom: '32px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
              <div>
                <h3 style={{fontSize: '1.25rem', color: 'var(--primary-hover)', textTransform: 'capitalize'}}>
                  {task.task_name.replace(/_/g, ' ')}
                </h3>
                <p style={{color: 'var(--text-muted)'}}>Target: <code>{task.target_column}</code></p>
              </div>
              <span className="badge badge-info">{model.replace(/_/g, ' ')}</span>
            </div>

            <div className="grid-3" style={{marginBottom: '32px'}}>
              {Object.entries(metrics).slice(0, 3).map(([key, value]) => (
                <div key={key} style={{background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px'}}>
                  <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase'}}>{key.replace(/_/g, ' ')}</div>
                  <div style={{fontSize: '1.5rem', fontWeight: 600}}>
                    {typeof value === 'number' ? 
                      (value < 0.001 && value > 0 ? value.toExponential(2) : value.toFixed(3)) 
                      : value}
                  </div>
                </div>
              ))}
            </div>

            <h4 style={{marginBottom: '16px', color: 'var(--text-muted)'}}>Top 5 Feature Importances</h4>
            <div style={{width: '100%', height: '250px'}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{top: 5, right: 30, left: 100, bottom: 5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="var(--text-muted)" />
                  <YAxis dataKey="name" type="category" stroke="var(--text-muted)" tick={{fontSize: 12}} width={120} />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                    contentStyle={{background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px'}}
                  />
                  <Bar dataKey="importance" fill="var(--secondary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
