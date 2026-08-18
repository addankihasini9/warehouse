import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, HelpCircle, Package, AlertTriangle, Play, Truck, Loader2 } from 'lucide-react';
import { resolveCopilotQuery } from '../utils/copilotEngine';
import { getLifecyclePayload } from '../utils/lifecycle';

export default function WarehouseCopilot({ orders = [], metadata = {}, updateOrder }) {
  const sampleActiveOrderId = useMemo(() => {
    const active = orders.find(o => o.Dispatch_Status !== 'Dispatched');
    return active ? active.Order_ID : (orders[0]?.Order_ID || 'ORD0001');
  }, [orders]);

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'copilot',
      text: `**INSIGHT**: Welcome to WarehouseIQ AI Copilot command interface.\n\n**EVIDENCE**: Successfully synchronized with live Firestore database comprising **${orders.length} orders**.\n\n**RECOMMENDATION**: Select an operational action suggestion chip below or enter a custom operational query in the terminal input.`,
      data: null,
      queryType: 'help'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [applyingAction, setApplyingAction] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const suggestions = useMemo(() => [
    { text: "Do we have any active exceptions?", icon: AlertTriangle },
    { text: "What should I prioritize?", icon: Sparkles },
    { text: `What is the status of order ${sampleActiveOrderId}?`, icon: Play },
    { text: "Do we have enough inventory?", icon: Package },
    { text: "Which SKU should we reorder?", icon: HelpCircle }
  ], [sampleActiveOrderId]);

  const handleSend = (textToSend) => {
    if (!textToSend.trim()) return;

    const userMsgId = Date.now();
    const newMsg = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
      data: null
    };

    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = resolveCopilotQuery(textToSend, orders, metadata);
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'copilot',
        text: response.text,
        data: response.data,
        decision: response.decision,
        queryType: response.type
      }]);
      setIsTyping(false);
    }, 600);
  };

  const executeCopilotAction = async (actionType, payload) => {
    const actionKey = `${actionType}-${payload.orderId || payload.sku || 'general'}`;
    setApplyingAction(actionKey);
    
    // Simulate short processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

      if (actionType === 'allocate') {
        const { orderId, quantity } = payload;
        await updateOrder(orderId, { Quantity_Allocated: quantity });
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          sender: 'copilot',
          text: `✅ **Action Applied**: Allocated **${quantity} units** to Order **#${orderId}**.`,
          data: null,
          queryType: 'general'
        }]);
      } 
      
      else if (actionType === 'dispatch') {
        const { orderId } = payload;
        await updateOrder(orderId, { 
          Dispatch_Status: 'Dispatched', 
          Dispatch_At: nowStr 
        });
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          sender: 'copilot',
          text: `✅ **Action Applied**: Order **#${orderId}** marked as **Dispatched** and removed from active picking queue.`,
          data: null,
          queryType: 'general'
        }]);
      } 
      
      else if (actionType === 'restock') {
        const { sku, quantity } = payload;
        const matchingOrders = orders.filter(o => o.SKU === sku);
        
        for (const order of matchingOrders) {
          await updateOrder(order.Order_ID || order.id, {
            Total_Inventory_On_Hand: (order.Total_Inventory_On_Hand || 0) + quantity,
            Total_Available: (order.Total_Available || 0) + quantity
          });
        }

        setMessages(prev => [...prev, {
          id: Date.now(),
          sender: 'copilot',
          text: `✅ **Action Applied**: Triggered restock of **${quantity} units** for SKU **\`${sku}\`**. Safety stocks restored.`,
          data: null,
          queryType: 'general'
        }]);
      }

      else if (actionType === 'resolve_shortage') {
        const { targetOrderId, transfers, gap, sku } = payload;
        
        if (transfers && transfers.length > 0) {
          let totalReallocated = 0;
          for (const t of transfers) {
            await updateOrder(t.donorOrderId, { 
              Quantity_Allocated: Math.max(0, t.currentAllocated - t.quantityToTake) 
            });
            totalReallocated += t.quantityToTake;
          }

          const targetOrder = orders.find(o => o.Order_ID === targetOrderId);
          if (targetOrder) {
            await updateOrder(targetOrderId, {
              Quantity_Allocated: (targetOrder.Quantity_Allocated || 0) + totalReallocated
            });
          }

          setMessages(prev => [...prev, {
            id: Date.now(),
            sender: 'copilot',
            text: `✅ **Action Applied**: Shifted **${totalReallocated} units** from donor stocks to Order **#${targetOrderId}**. Shortage resolved.`,
            data: null,
            queryType: 'general'
          }]);
        } else {
          // Fallback restock
          const sameSkuOrders = orders.filter(o => o.SKU === sku);
          const restockQty = gap * 2;
          
          for (const order of sameSkuOrders) {
            await updateOrder(order.Order_ID || order.id, {
              Total_Inventory_On_Hand: (order.Total_Inventory_On_Hand || 0) + restockQty,
              Total_Available: (order.Total_Available || 0) + restockQty
            });
          }
          await updateOrder(targetOrderId, { Quantity_Allocated: gap });

          setMessages(prev => [...prev, {
            id: Date.now(),
            sender: 'copilot',
            text: `✅ **Action Applied**: Executed emergency procurement of **${restockQty} units** for SKU \`${sku}\` and allocated Order **#${targetOrderId}**.`,
            data: null,
            queryType: 'general'
          }]);
        }
      }

      else if (actionType === 'replace_damaged') {
        const { orderId } = payload;
        await updateOrder(orderId, { Damaged_Items: 0 });
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          sender: 'copilot',
          text: `✅ **Action Applied**: Damaged items replaced. QA Fail Hold cleared for Order **#${orderId}**.`,
          data: null,
          queryType: 'general'
        }]);
      }

      else if (actionType === 'swap_carrier') {
        const { orderId } = payload;
        await updateOrder(orderId, { 
          Carrier: 'Blue Dart',
          Dispatch_Status: 'Dispatched',
          Dispatch_At: nowStr
        });
        
        setMessages(prev => [...prev, {
          id: Date.now(),
          sender: 'copilot',
          text: `✅ **Action Applied**: Swapped carrier connection to **Blue Dart** and marked Order **#${orderId}** as **Dispatched**.`,
          data: null,
          queryType: 'general'
        }]);
      }

      else if (actionType === 'lifecycle_advance') {
        const { orderId, action, label } = payload;
        const order = orders.find(o => o.Order_ID === orderId);
        
        if (order) {
          const transitionPayload = getLifecyclePayload(action, order, orders);
          
          if (transitionPayload.Total_Available !== undefined || transitionPayload.Total_Inventory_On_Hand !== undefined) {
            const targetSku = order.SKU;
            const sameSkuOrders = orders.filter(o => o.SKU === targetSku);
            
            for (const o of sameSkuOrders) {
              await updateOrder(o.Order_ID || o.id, {
                Total_Inventory_On_Hand: transitionPayload.Total_Inventory_On_Hand !== undefined ? transitionPayload.Total_Inventory_On_Hand : o.Total_Inventory_On_Hand,
                Total_Reserved: transitionPayload.Total_Reserved !== undefined ? transitionPayload.Total_Reserved : o.Total_Reserved,
                Total_Available: transitionPayload.Total_Available !== undefined ? transitionPayload.Total_Available : o.Total_Available
              });
            }
          }

          await updateOrder(orderId, transitionPayload);

          setMessages(prev => [...prev, {
            id: Date.now(),
            sender: 'copilot',
            text: `✅ **Action Applied**: Order **#${orderId}** advanced via transition: **"${label}"**.`,
            data: null,
            queryType: 'general'
          }]);
        }
      }
    } catch (err) {
      console.error("Failed to execute copilot action:", err);
    } finally {
      setApplyingAction(null);
    }
  };

  const getDecisionActionButtonLabel = (actionType) => {
    switch (actionType) {
      case 'allocate': return 'Allocate Stock';
      case 'dispatch': return 'Prioritize Order';
      case 'restock': return 'Create Reorder';
      case 'resolve_shortage': return 'Apply Decision';
      default: return 'Resolve Exception';
    }
  };

  const renderDecisionCard = (decision) => {
    if (!decision) return null;
    const actionKey = `${decision.actionType}-${decision.payload.orderId || decision.payload.sku || 'general'}`;
    const isApplying = applyingAction === actionKey;

    return (
      <div className="decision-card" style={{ marginTop: '12px', background: 'var(--bg-soft)', borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Sparkles size={12} color="var(--primary)" />
          <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Decision Matrix Blueprint</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div className="decision-label">Situation</div>
            <div className="decision-value" style={{ fontSize: '0.75rem' }}>{decision.situation}</div>
          </div>
          <div>
            <div className="decision-label" style={{ color: 'var(--danger)' }}>Risk Assessment</div>
            <div className="decision-value" style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 500 }}>{decision.risk}</div>
          </div>
          <div>
            <div className="decision-label">Quantitative Evidence</div>
            <div className="decision-value" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{decision.evidence}</div>
          </div>
          <div>
            <div className="decision-label" style={{ color: 'var(--success)' }}>Resolution Recommendation</div>
            <div className="decision-value" style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 500 }}>{decision.recommendation}</div>
          </div>
          <div>
            <div className="decision-label">Fulfillment Impact</div>
            <div className="decision-value" style={{ fontSize: '0.75rem' }}>{decision.expectedImpact}</div>
          </div>
        </div>

        {decision.actionType && (
          <button
            onClick={() => executeCopilotAction(decision.actionType, decision.payload)}
            disabled={isApplying}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              border: 'none',
              color: 'white',
              padding: '8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.75rem',
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {isApplying ? <Loader2 size={12} className="spinner" /> : null}
            {isApplying ? 'Applying State Shift...' : getDecisionActionButtonLabel(decision.actionType)}
          </button>
        )}
      </div>
    );
  };

  const renderDataWidget = (msg) => {
    if (!msg.data) return null;
    const actionKey = `widget-${msg.id}`;
    const isApplying = applyingAction === actionKey;

    switch(msg.queryType) {
      case 'exceptions_list':
        return (
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px'}}>
            {msg.data.slice(0, 2).map((exc, idx) => (
              <div key={idx} className="decision-card" style={{padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0}}>
                <div>
                  <div style={{fontWeight: 800, fontSize: '0.7rem', color: 'var(--danger)'}}>{exc.type}</div>
                  <div style={{fontSize: '0.65rem', color: 'var(--text-muted)'}}>{exc.orderId ? `Order #${exc.orderId}` : `SKU ${exc.sku}`}</div>
                  <div style={{fontSize: '0.7rem', color: 'var(--text-main)', marginTop: '2px'}}>{exc.message}</div>
                </div>
                <button
                  onClick={() => executeCopilotAction(exc.actionType, exc.payload)}
                  style={{background: 'var(--bg-soft)', border: '1px solid var(--border)', color: 'white', padding: '4px 10px', borderRadius: '5px', fontSize: '0.7rem', cursor: 'pointer'}}
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        );

      case 'lifecycle_advance':
        const { orderId, stage, nextAction, label } = msg.data;
        return (
          <div style={{background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', border: '1px solid var(--border)'}}>
            <div>
              <div style={{fontSize: '0.75rem', fontWeight: 700}}>Order Status Workflow</div>
              <div style={{fontSize: '0.65rem', color: 'var(--text-muted)'}}>Current Stage: <strong>{stage}</strong></div>
            </div>
            {nextAction && (
              <button
                onClick={() => executeCopilotAction('lifecycle_advance', { orderId, action: nextAction, label })}
                style={{background: 'linear-gradient(135deg, var(--primary), var(--secondary))', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '5px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700}}
              >
                {label}
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)', gap: '12px' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
          padding: '6px',
          borderRadius: '8px',
          color: 'white'
        }}>
          <Sparkles size={16} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>WarehouseIQ Copilot</h1>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Conversational Interface to Decision Engine & ML Predictors</p>
        </div>
      </header>

      {/* Chat Viewport */}
      <div style={{
        flex: 1,
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxHeight: 'calc(100vh - 280px)'
      }}>
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                width: '100%',
                gap: '8px'
              }}
            >
              {msg.sender === 'copilot' && (
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Sparkles size={11} color="white" />
                </div>
              )}

              <div style={{
                maxWidth: '75%',
                background: msg.sender === 'user' ? 'var(--primary-soft)' : 'var(--bg-card)',
                border: msg.sender === 'user' ? '1px solid rgba(79, 70, 229, 0.3)' : '1px solid var(--border)',
                padding: '10px 14px',
                borderRadius: msg.sender === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                lineHeight: '1.4'
              }}>
                <div>
                  {msg.text.split('\n').map((line, lIdx) => {
                    const formattedLine = line
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\`(.*?)\`/g, '<code style="background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px; color: var(--primary-hover)">$1</code>');
                    return (
                      <p key={lIdx} dangerouslySetInnerHTML={{ __html: formattedLine }} style={{ marginBottom: '4px' }} />
                    );
                  })}
                </div>

                {renderDecisionCard(msg.decision)}
                {renderDataWidget(msg)}
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '8px' }}>
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Sparkles size={11} color="white" />
              </div>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                borderRadius: '10px 10px 10px 2px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}>
                <span className="dot-typing" style={{ animationDelay: '0ms' }}>.</span>
                <span className="dot-typing" style={{ animationDelay: '200ms' }}>.</span>
                <span className="dot-typing" style={{ animationDelay: '400ms' }}>.</span>
              </div>
            </div>
          )}
        </AnimatePresence>
        <div ref={chatEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        padding: '2px 0'
      }}>
        {suggestions.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(chip.text)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '4px 10px',
              borderRadius: '15px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <chip.icon size={8} />
            {chip.text}
          </button>
        ))}
      </div>

      {/* Message Input Box */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        style={{
          display: 'flex',
          gap: '8px'
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot about risk, Safety margins, bottlenecks, or shortages..."
          style={{
            flex: 1,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px 14px',
            color: 'var(--text-main)',
            outline: 'none',
            fontSize: '0.8rem'
          }}
        />
        <button
          type="submit"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            border: 'none',
            borderRadius: '8px',
            padding: '0 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Send size={14} color="white" />
        </button>
      </form>
    </motion.div>
  );
}
