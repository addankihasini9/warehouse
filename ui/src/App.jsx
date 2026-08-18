import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, Box, ShoppingCart, 
  HardHat, Truck, BarChart3, Package, Sparkles,
  Search, Bell, Sun, Moon, MapPin, X, AlertTriangle, Check
} from 'lucide-react';

import DashboardOverview from './pages/DashboardOverview';
import DataProfileView from './pages/DataProfileView';
import InventoryMonitoring from './pages/InventoryMonitoring';
import OrderManagement from './pages/OrderManagement';
import WarehouseOperations from './pages/WarehouseOperations';
import FulfillmentTracking from './pages/FulfillmentTracking';
import WarehouseCopilot from './pages/WarehouseCopilot';
import DecisionEngineView from './pages/DecisionEngineView';

import { useWarehouseData } from './hooks/useWarehouseData';
import { auditExceptions } from './utils/decisionEngine';
import { Loader2 } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom dropdown / Modal toggles
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  const { orders, metadata, loading, error, updateOrder, updateMetadata } = useWarehouseData();
  const [notificationsList, setNotificationsList] = useState([]);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
    }
  }, [isDarkMode]);

  // Sync exception counts to live notifications dropdown
  useEffect(() => {
    if (orders && orders.length > 0) {
      const activeExceptions = auditExceptions(orders);
      const mapped = activeExceptions.map(exc => ({
        id: exc.id || `${exc.orderId}-${exc.type}`,
        message: exc.message,
        type: exc.type.includes('Stock') ? 'danger' : 'warning'
      }));
      setNotificationsList(mapped);
    }
  }, [orders]);

  // Reset search query when tabs change
  useEffect(() => {
    setSearchQuery('');
  }, [activeTab]);

  const handleDismissNotification = (id, e) => {
    e.stopPropagation();
    setNotificationsList(prev => prev.filter(n => n.id !== id));
  };

  const renderContent = () => {
    if (loading) return (
      <div style={{display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'}}>
        <Loader2 className="animate-spin" size={24} style={{marginRight: '12px', color: 'var(--primary)'}} />
        <span style={{fontSize: '0.85rem', fontWeight: 600}}>Syncing live warehouse records...</span>
      </div>
    );
    if (error) return <div style={{color: 'var(--danger)', padding: '24px'}}>Error: {error}</div>;

    switch(activeTab) {
      case 'overview': return <DashboardOverview orders={orders} metadata={metadata} updateOrder={updateOrder} setActiveTab={setActiveTab} />;
      case 'copilot': return <WarehouseCopilot orders={orders} metadata={metadata} updateOrder={updateOrder} />;
      case 'inventory': return <InventoryMonitoring orders={orders} searchQuery={searchQuery} />;
      case 'orders': return <OrderManagement orders={orders} updateOrder={updateOrder} searchQuery={searchQuery} />;
      case 'operations': return <WarehouseOperations orders={orders} updateOrder={updateOrder} searchQuery={searchQuery} />;
      case 'fulfillment': return <FulfillmentTracking orders={orders} updateOrder={updateOrder} searchQuery={searchQuery} />;
      case 'analytics': return <DecisionEngineView orders={orders} updateOrder={updateOrder} />; 
      case 'profile': return <DataProfileView metadata={metadata} updateMetadata={updateMetadata} />;
      default: return <DashboardOverview orders={orders} metadata={metadata} updateOrder={updateOrder} setActiveTab={setActiveTab} />;
    }
  };

  const coreNavItems = [
    { id: 'overview', label: 'Overview', icon: Box },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'operations', label: 'Pick & Pack', icon: HardHat },
    { id: 'fulfillment', label: 'Dispatch', icon: Truck },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 }
  ];

  const systemNavItems = [
    { id: 'profile', label: 'Data Profile', icon: Database }
  ];

  const showSearchInput = ['orders', 'inventory', 'operations', 'fulfillment'].includes(activeTab);

  return (
    <div className="dashboard-layout">

      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          top: '-40px',
          left: '0',
          background: 'var(--primary)',
          color: 'white',
          padding: '8px 12px',
          zIndex: 9999,
          fontWeight: 700,
          fontSize: '0.8rem',
          transition: 'top 0.2s'
        }}
        onFocus={e => e.currentTarget.style.top = '0'}
        onBlur={e => e.currentTarget.style.top = '-40px'}
      >
        Skip to content
      </a>

      {/* 1. SIDEBAR */}
      <nav className="sidebar" aria-label="Main navigation">
        <div>
          <div className="brand" style={{ gap: '8px' }}>
            <Box size={20} color="var(--primary)" />
            <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>WareMind AI</span>
          </div>
          <div className="brand-subtitle" style={{ fontSize: '0.65rem', marginBottom: '20px' }}>AI COMMAND CENTER</div>
        </div>
        
        <div className="nav-links" style={{ gap: '2px' }}>
          {coreNavItems.map(item => (
            <button 
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? 'page' : undefined}
              aria-label={item.label}
              style={{
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.75rem',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                cursor: 'pointer'
              }}
            >
              <item.icon size={14} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}

          <div style={{ margin: '12px 0 6px 12px', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="brand-subtitle + div">
            System Data
          </div>

          {systemNavItems.map(item => (
            <button 
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              aria-current={activeTab === item.id ? 'page' : undefined}
              aria-label={item.label}
              style={{
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.75rem',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                cursor: 'pointer'
              }}
            >
              <item.icon size={14} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* AI Copilot card */}
        <div className="copilot-sidebar-card" style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <Sparkles size={12} color="var(--primary)" />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>AI Copilot</span>
          </div>
          <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.3 }}>
            Query bottlenecks, priorities, or exceptions.
          </p>
          <button 
            onClick={() => setActiveTab('copilot')}
            aria-label="Open AI Copilot chat"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              border: 'none',
              color: 'white',
              padding: '6px',
              borderRadius: '5px',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Ask Copilot
          </button>
        </div>

        {/* Footer Admin Profile */}
        <div 
          role="button"
          tabIndex={0}
          aria-label="View admin profile"
          onClick={() => setShowProfileModal(true)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowProfileModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: 'auto', cursor: 'pointer' }}
        >
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: 'var(--bg-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.7rem',
            color: 'var(--text-main)'
          }}>
            AM
          </div>
          <div style={{ overflow: 'hidden', lineHeight: '1.2' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Admin Manager</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>admin@waremind.ai</div>
          </div>
        </div>
      </nav>

      {/* 2. MAIN CONTENT VIEWPORT */}
      <div className="content-wrapper" id="main-content" role="main">
        
        {/* Top Header */}
        <header className="main-header">
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>Good morning, Admin 👋</h2>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>Fulfillment metrics are updating in real-time.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            
            {/* Search Input (conditionally rendered only where needed) */}
            {showSearchInput && (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <label htmlFor="header-search" className="sr-only">Search {activeTab}</label>
                <Search size={12} color="var(--text-muted)" style={{ position: 'absolute', left: '10px' }} aria-hidden="true" />
                <input 
                  id="header-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${activeTab}...`} 
                  aria-label={`Search ${activeTab}`}
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '4px 10px 4px 26px',
                    fontSize: '0.7rem',
                    outline: 'none',
                    width: '180px',
                    color: 'var(--text-main)'
                  }}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {/* Warehouse status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <MapPin size={11} color="var(--success)" />
              <span>Vijayawada WH</span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'var(--success)' }}></span>
              <span style={{ fontSize: '0.65rem', color: 'var(--success)', fontWeight: 700 }}>Online</span>
            </div>

            {/* Notification Bell Dropdown */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowNotifications(prev => !prev)}
                aria-label={`Notifications — ${notificationsList.length} active alerts`}
                aria-expanded={showNotifications}
                aria-haspopup="true"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', position: 'relative' }}
              >
                <Bell size={14} aria-hidden="true" />
                {notificationsList.length > 0 && (
                  <span
                    aria-live="polite"
                    aria-atomic="true"
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      backgroundColor: 'var(--danger)',
                      color: 'white',
                      fontSize: '0.5rem',
                      fontWeight: 700,
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <span aria-hidden="true">{notificationsList.length}</span>
                  </span>
                )}
              </button>

              {/* Notification Overlay Menu */}
              {showNotifications && (
                <div className="dropdown-menu">
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', paddingBottom: '8px', color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Active Alerts ({notificationsList.length})</span>
                    <button 
                      onClick={() => setShowNotifications(false)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {notificationsList.map(n => (
                      <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', padding: '6px', background: 'var(--bg-soft)', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', gap: '6px', minWidth: 0 }}>
                          <AlertTriangle size={12} color={n.type === 'danger' ? 'var(--danger)' : 'var(--warning)'} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{n.message}</span>
                        </div>
                        <button 
                          onClick={(e) => handleDismissNotification(n.id, e)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {notificationsList.length === 0 && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                        No active exception alerts.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button 
              onClick={() => setIsDarkMode(prev => !prev)}
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
            >
              {isDarkMode ? <Sun size={12} /> : <Moon size={12} />}
            </button>

            {/* Profile Avatar Trigger */}
            <button 
              onClick={() => setShowProfileModal(true)}
              style={{
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                border: 'none',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.7rem',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              AM
            </button>

          </div>
        </header>

        {/* Main Content Layout with smooth page transitions */}
        <main className="main-content" style={{ position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ height: '100%' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* 3. PROFILE MODAL OVERLAY */}
      {showProfileModal && (
        <div className="profile-modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: 'white'
                }}>
                  AM
                </div>
                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>Admin Profile</h3>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Role: Command Manager</span>
                </div>
              </div>
              <button 
                onClick={() => setShowProfileModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                <span style={{ fontWeight: 700 }}>admin@waremind.ai</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Warehouse ID:</span>
                <span style={{ fontWeight: 700 }}>WH002 (Vijayawada)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>System State:</span>
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>Fully Sync'd</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Active Connection:</span>
                <span style={{ fontWeight: 700 }}>Firestore Cloud DB</span>
              </div>
            </div>

            <button 
              onClick={() => {
                setShowProfileModal(false);
                alert("Session terminated successfully.");
              }}
              style={{
                width: '100%',
                background: 'var(--danger-soft)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                padding: '8px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
                textAlign: 'center',
                marginTop: '8px'
              }}
            >
              Log Out Session
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
