/**
 * WarehouseIQ Deterministic Decision Engine
 * Implements strict operational rules and algorithms for prioritizations,
 * stock allocations, safety margins, and shortage resolutions.
 */

// 1. Prioritization Engine: Sorts active orders by priority, FIFO creation time, and quantity
export function prioritizeOrders(orders = []) {
  const activeOrders = orders.filter(o => o.Dispatch_Status !== 'Dispatched');
  
  const priorityWeight = {
    'Critical': 4,
    'High': 3,
    'Medium': 2,
    'Low': 1
  };

  return [...activeOrders].sort((a, b) => {
    const weightA = priorityWeight[a.Order_Priority] || 0;
    const weightB = priorityWeight[b.Order_Priority] || 0;
    if (weightB !== weightA) return weightB - weightA;

    const timeA = new Date(a.Order_Created_At || 0).getTime();
    const timeB = new Date(b.Order_Created_At || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;

    return (b.Order_Quantity || 0) - (a.Order_Quantity || 0);
  });
}

// 2. Stock Allocation Engine: Evaluates SKU availability and flags shortages
export function allocateInventory(orders = []) {
  const skuBalances = {};
  orders.forEach(o => {
    if (!skuBalances[o.SKU]) {
      skuBalances[o.SKU] = o.Total_Available || 0;
    }
  });

  const sortedOrders = prioritizeOrders(orders);
  const allocations = {};
  const exceptions = [];

  sortedOrders.forEach(order => {
    const sku = order.SKU;
    const needed = order.Order_Quantity || 1;
    const currentAvailable = skuBalances[sku] || 0;

    if (currentAvailable >= needed) {
      allocations[order.Order_ID] = {
        allocated: needed,
        status: 'Allocated'
      };
      skuBalances[sku] -= needed;
    } else {
      allocations[order.Order_ID] = {
        allocated: Math.max(0, currentAvailable),
        status: 'Shortage'
      };
      const gap = needed - Math.max(0, currentAvailable);
      exceptions.push({
        orderId: order.Order_ID,
        sku: order.SKU,
        productName: order.Product_Name,
        priority: order.Order_Priority,
        requested: needed,
        allocated: Math.max(0, currentAvailable),
        gap
      });
      skuBalances[sku] = 0;
    }
  });

  return { allocations, exceptions };
}

// 3. Reorder Recommendations: Calculates Safety Stock and Reorder Points using ML demand forecasts
export function recommendReorders(orders = []) {
  const skuMap = {};
  orders.forEach(o => {
    if (!skuMap[o.SKU]) {
      skuMap[o.SKU] = {
        sku: o.SKU,
        name: o.Product_Name,
        available: o.Total_Available || 0,
        demand: o.Avg_Daily_Demand_Units || 15.0,
        totalStock: o.Total_Inventory_On_Hand || 0,
        reserved: o.Total_Reserved || 0
      };
    }
  });

  const recommendations = [];

  Object.values(skuMap).forEach(item => {
    const dailyDemand = item.demand;
    const reorderPoint = dailyDemand * 3;
    const safetyStock = dailyDemand * 7;

    let status = 'Healthy';
    let recommendation = 'No Action Required';
    let recommendedOrderQty = 0;

    if (item.available <= reorderPoint) {
      status = 'Critical';
      recommendation = 'Immediate Restock Required';
      recommendedOrderQty = Math.ceil(dailyDemand * 14);
    } else if (item.available <= safetyStock) {
      status = 'Warning';
      recommendation = 'Prepare Restock Order';
      recommendedOrderQty = Math.ceil(dailyDemand * 7);
    }

    recommendations.push({
      ...item,
      reorderPoint,
      safetyStock,
      status,
      recommendation,
      recommendedOrderQty
    });
  });

  const severityMap = { 'Critical': 3, 'Warning': 2, 'Healthy': 1 };
  return recommendations.sort((a, b) => severityMap[b.status] - severityMap[a.status]);
}

// 4. Reallocation Exceptions Engine: Scans for active donor orders to resolve critical shortages
export function resolveShortageException(targetOrder, orders = []) {
  if (!targetOrder || targetOrder.Quantity_Allocated >= targetOrder.Order_Quantity) {
    return null;
  }

  const gap = targetOrder.Order_Quantity - targetOrder.Quantity_Allocated;
  const targetSku = targetOrder.SKU;

  const activeDonors = orders.filter(o => 
    o.SKU === targetSku &&
    o.Dispatch_Status !== 'Dispatched' &&
    o.Order_ID !== targetOrder.Order_ID &&
    o.Quantity_Allocated > 0 &&
    (o.Order_Priority === 'Low' || o.Order_Priority === 'Medium')
  );

  const priorityWeight = { 'Low': 1, 'Medium': 2 };
  const sortedDonors = [...activeDonors].sort((a, b) => {
    const wA = priorityWeight[a.Order_Priority] || 0;
    const wB = priorityWeight[b.Order_Priority] || 0;
    if (wA !== wB) return wA - wB;
    return a.Quantity_Allocated - b.Quantity_Allocated;
  });

  let allocatedTransfers = [];
  let accumulatedStock = 0;

  for (const donor of sortedDonors) {
    const remainingNeeded = gap - accumulatedStock;
    const take = Math.min(donor.Quantity_Allocated, remainingNeeded);
    
    allocatedTransfers.push({
      donorOrderId: donor.Order_ID,
      donorPriority: donor.Order_Priority,
      quantityToTake: take,
      currentAllocated: donor.Quantity_Allocated
    });

    accumulatedStock += take;
    if (accumulatedStock >= gap) break;
  }

  return {
    targetOrderId: targetOrder.Order_ID,
    sku: targetSku,
    productName: targetOrder.Product_Name,
    gap,
    accumulatedStock,
    transfers: allocatedTransfers,
    isFullyResolvable: accumulatedStock >= gap
  };
}

// 5. Exception Auditing Engine: Audits all 7 operational exception categories
export function auditExceptions(orders = []) {
  const exceptions = [];

  // Add SKU level shortages (Low/Out of stock)
  const reorderRecs = recommendReorders(orders).filter(r => r.status !== 'Healthy');
  reorderRecs.forEach(r => {
    exceptions.push({
      id: `${r.sku}_stockout`,
      sku: r.sku,
      type: 'Low/Out of Stock',
      message: `SKU ${r.sku} available stock (${r.available}) is below safety threshold (${r.safetyStock.toFixed(1)}).`,
      decision: `Dispatch purchase order of ${r.recommendedOrderQty} units to restore safety stock buffer.`,
      actionType: 'restock_sku',
      payload: { sku: r.sku, quantity: r.recommendedOrderQty }
    });
  });

  orders.forEach(o => {
    const isDispatched = o.Dispatch_Status === 'Dispatched';
    if (isDispatched) return;

    // 1. Insufficient Stock (Order allocation gap)
    if (o.Quantity_Allocated < o.Order_Quantity) {
      const gap = o.Order_Quantity - o.Quantity_Allocated;
      exceptions.push({
        id: `${o.Order_ID}_shortage`,
        orderId: o.Order_ID,
        sku: o.SKU,
        type: 'Insufficient Stock',
        message: `Order requires ${o.Order_Quantity} units, but only ${o.Quantity_Allocated} are allocated (Deficit: ${gap} units).`,
        decision: 'Reallocate stock from lower-priority orders or trigger procurement.',
        actionType: 'resolve_shortage',
        payload: { orderId: o.Order_ID, sku: o.SKU, gap }
      });
    }

    // 3. Damaged Items (QA Hold)
    if (o.Damaged_Items > 0) {
      exceptions.push({
        id: `${o.Order_ID}_damaged`,
        orderId: o.Order_ID,
        sku: o.SKU,
        type: 'Damaged Items',
        message: `${o.Damaged_Items} units of ${o.Product_Name} marked as damaged in QA.`,
        decision: 'Deduct damaged count from inventory, clear damage status, and re-allocate replacement.',
        actionType: 'replace_damaged',
        payload: { orderId: o.Order_ID, sku: o.SKU, qty: o.Damaged_Items }
      });
    }

    // 4. Missing Items (Picking discrepancy)
    if (o.Quantity_Picked < o.Quantity_Allocated) {
      const missing = o.Quantity_Allocated - o.Quantity_Picked;
      exceptions.push({
        id: `${o.Order_ID}_missing`,
        orderId: o.Order_ID,
        sku: o.SKU,
        type: 'Missing Items',
        message: `Picking discrepancy: ${missing} units allocated but missing from shelf.`,
        decision: 'Complete picking, deduct missing count from inventory, and reconcile shelf counts.',
        actionType: 'reconcile_missing',
        payload: { orderId: o.Order_ID, sku: o.SKU, qty: missing }
      });
    }

    // 5. Picking Delay
    const isPickingDelay = o.Picking_Start && !o.Picking_End && o.Processing_Time_Minutes > 80;
    if (isPickingDelay) {
      exceptions.push({
        id: `${o.Order_ID}_pick_delay`,
        orderId: o.Order_ID,
        sku: o.SKU,
        type: 'Picking Delay',
        message: `Picking operation exceeding processing safety limit (Duration: ${o.Processing_Time_Minutes} mins).`,
        decision: 'Escalate picker assignment to complete retrieval instantly.',
        actionType: 'escalate_picking',
        payload: { orderId: o.Order_ID }
      });
    }

    // 6. Packing Delay
    const isPackingDelay = o.Packing_Start && o.Packing_Status !== 'Packed' && o.Processing_Time_Minutes > 80;
    if (isPackingDelay) {
      exceptions.push({
        id: `${o.Order_ID}_pack_delay`,
        orderId: o.Order_ID,
        sku: o.SKU,
        type: 'Packing Delay',
        message: `Packing operation exceeding processing safety limit (Duration: ${o.Processing_Time_Minutes} mins).`,
        decision: 'Expedite boxing queue and close parcel assignment.',
        actionType: 'expedite_packing',
        payload: { orderId: o.Order_ID }
      });
    }

    // 7. Dispatch Delay
    const isDispatchDelay = o.Packing_Status === 'Packed' && o.Dispatch_Status !== 'Dispatched' && o.Carrier === 'DTDC';
    if (isDispatchDelay) {
      exceptions.push({
        id: `${o.Order_ID}_dispatch_delay`,
        orderId: o.Order_ID,
        sku: o.SKU,
        type: 'Dispatch Delay',
        message: `Dispatch pending on high-delay carrier (DTDC).`,
        decision: 'Swap carrier to Blue Dart (lowest ML delay risk metrics) and dispatch.',
        actionType: 'swap_carrier',
        payload: { orderId: o.Order_ID }
      });
    }
  });

  return exceptions;
}
