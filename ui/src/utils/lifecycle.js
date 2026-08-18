/**
 * Order Lifecycle State Machine Helpers
 */

export const LIFECYCLE_STAGES = [
  'Created',
  'Priority Assigned',
  'Inventory Checked',
  'Allocated',
  'Picked',
  'Packed',
  'QA Passed',
  'Dispatched'
];

export function getOrderStage(order) {
  if (order.Dispatch_Status === 'Dispatched') {
    return 'Dispatched';
  }
  if (order.Packing_Status === 'Packed') {
    if (order.Damaged_Items > 0) {
      return 'QA Hold';
    }
    return 'QA Passed';
  }
  if (order.Quantity_Picked >= order.Order_Quantity) {
    return 'Picked';
  }
  if (order.Quantity_Allocated >= order.Order_Quantity) {
    return 'Allocated';
  }
  if (order.Inventory_Available === 'Yes') {
    return 'Inventory Checked';
  }
  if (order.Order_Priority) {
    return 'Priority Assigned';
  }
  return 'Created';
}

export function getNextStageAction(stage) {
  switch (stage) {
    case 'Created':
      return { action: 'assign_priority', label: 'Assign Priority' };
    case 'Priority Assigned':
      return { action: 'check_inventory', label: 'Run Inventory Check' };
    case 'Inventory Checked':
      return { action: 'allocate_stock', label: 'Allocate Stock' };
    case 'Allocated':
      return { action: 'pick_items', label: 'Complete Picking' };
    case 'Picked':
      return { action: 'pack_items', label: 'Complete Packing' };
    case 'Packed':
      return { action: 'run_qa', label: 'Pass QA Inspection' };
    case 'QA Hold':
      return { action: 'resolve_qa', label: 'Resolve QA Damage' };
    case 'QA Passed':
      return { action: 'dispatch_order', label: 'Dispatch Shipment' };
    case 'Dispatched':
    default:
      return null;
  }
}

export function getLifecyclePayload(action, order, orders = []) {
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
  
  switch (action) {
    case 'assign_priority':
      return { Order_Priority: 'High' }; // default transition
      
    case 'check_inventory':
      const availableStock = order.Total_Available || 0;
      const needed = order.Order_Quantity || 1;
      return { Inventory_Available: availableStock >= needed ? 'Yes' : 'No' };
      
    case 'allocate_stock':
      const qty = order.Order_Quantity;
      // In a real DB we decrease available stock and increase reserved stock.
      // We will decrease Total_Available and increase Total_Reserved.
      // We also update Quantity_Allocated.
      return {
        Quantity_Allocated: qty,
        Total_Reserved: (order.Total_Reserved || 0) + qty,
        Total_Available: (order.Total_Available || 0) - qty
      };
      
    case 'pick_items':
      return {
        Quantity_Picked: order.Order_Quantity,
        Picking_Start: nowStr,
        Picking_End: nowStr
      };
      
    case 'pack_items':
      return {
        Packing_Status: 'Packed',
        Packing_Start: nowStr,
        Packing_End: nowStr
      };
      
    case 'run_qa':
      return { Damaged_Items: 0 };
      
    case 'resolve_qa':
      return { Damaged_Items: 0 };
      
    case 'dispatch_order':
      // Physical stock deduction: deducts On Hand and clears Reservation
      const orderQty = order.Order_Quantity;
      return {
        Dispatch_Status: 'Dispatched',
        Dispatch_At: nowStr,
        Total_Inventory_On_Hand: Math.max(0, (order.Total_Inventory_On_Hand || 0) - orderQty),
        Total_Reserved: Math.max(0, (order.Total_Reserved || 0) - orderQty)
      };
      
    default:
      return {};
  }
}
