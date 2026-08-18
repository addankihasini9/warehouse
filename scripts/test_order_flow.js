import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getOrderStage, getNextStageAction, getLifecyclePayload } from '../ui/src/utils/lifecycle.js';
import { resolveCopilotQuery } from '../ui/src/utils/copilotEngine.js';

// Setup Mock DB using the parsed CSV json data as source of truth
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ordersPath = path.resolve(__dirname, '../ui/src/data/warehouse_orders.json');
const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));

// Target SKU to monitor
const targetSku = 'SKU002'; // Mechanical Keyboard
const template = orders.find(o => o.SKU === targetSku);

// CLONE stock values before running transitions
const initialOnHand = template.Total_Inventory_On_Hand;
const initialReserved = template.Total_Reserved;
const initialAvailable = template.Total_Available;

console.log("====================================================");
console.log("STARTING END-TO-END ORDER LIFECYCLE SIMULATION TEST");
console.log("====================================================\n");

console.log(`Initial SKU002 Stock Parameters:`);
console.log(`- On Hand: ${initialOnHand}`);
console.log(`- Reserved: ${initialReserved}`);
console.log(`- Available: ${initialAvailable}\n`);

// 1. CREATE ORDER ORD0151
const nextOrderId = 'ORD0151';
const quantityToOrder = 5;

let newOrder = {
  Order_ID: nextOrderId,
  id: nextOrderId,
  SKU: targetSku,
  Product_Name: template.Product_Name,
  Warehouse_ID: template.Warehouse_ID,
  Warehouse_Name: template.Warehouse_Name,
  Warehouse_City: template.Warehouse_City,
  Order_Created_At: new Date().toISOString().replace('T', ' ').substring(0, 16),
  Order_Quantity: quantityToOrder,
  Order_Priority: 'High',
  Inventory_Available: 'No',
  Quantity_Allocated: 0,
  Quantity_Picked: 0,
  Packing_Status: 'Pending',
  Dispatch_Status: 'Pending',
  Damaged_Items: 0,
  Total_Inventory_On_Hand: initialOnHand,
  Total_Reserved: initialReserved,
  Total_Available: initialAvailable,
  Avg_Daily_Demand_Units: template.Avg_Daily_Demand_Units
};

// Add to local orders list
orders.push(newOrder);
console.log(`[Stage 1] Created Order: ${newOrder.Order_ID} | Product: ${newOrder.Product_Name} | Qty: ${newOrder.Order_Quantity}`);

// 2. STEP THROUGH LIFECYCLE STAGES
const stagesToRun = [
  'check_inventory',
  'allocate_stock',
  'pick_items',
  'pack_items',
  'run_qa',
  'dispatch_order'
];

stagesToRun.forEach(action => {
  const payload = getLifecyclePayload(action, newOrder, orders);
  
  // Propagate stock changes to SKU across mock DB
  if (payload.Total_Available !== undefined || payload.Total_Inventory_On_Hand !== undefined) {
    orders.forEach(o => {
      if (o.SKU === targetSku) {
        o.Total_Inventory_On_Hand = payload.Total_Inventory_On_Hand !== undefined ? payload.Total_Inventory_On_Hand : o.Total_Inventory_On_Hand;
        o.Total_Reserved = payload.Total_Reserved !== undefined ? payload.Total_Reserved : o.Total_Reserved;
        o.Total_Available = payload.Total_Available !== undefined ? payload.Total_Available : o.Total_Available;
      }
    });
  }

  // Update order document
  newOrder = { ...newOrder, ...payload };

  // Sync back to orders array
  const idx = orders.findIndex(o => o.Order_ID === nextOrderId);
  if (idx !== -1) {
    orders[idx] = newOrder;
  }

  console.log(`[Stage Transition] Executed action: "${action}" -> Current Stage: "${getOrderStage(newOrder)}"`);
});

console.log("\n====================================================");
console.log("VERIFYING RESULTS");
console.log("====================================================\n");

console.log(`Post-Dispatch SKU002 Stock Parameters:`);
console.log(`- On Hand: ${newOrder.Total_Inventory_On_Hand} (Expected: ${initialOnHand - quantityToOrder})`);
console.log(`- Reserved: ${newOrder.Total_Reserved} (Expected: ${initialReserved})`);
console.log(`- Available: ${newOrder.Total_Available} (Expected: ${initialAvailable - quantityToOrder})\n`);

// Verify stock deduction counts match
const expectedOnHand = initialOnHand - quantityToOrder;
const expectedAvailable = initialAvailable - quantityToOrder;

if (newOrder.Total_Inventory_On_Hand === expectedOnHand && newOrder.Total_Available === expectedAvailable) {
  console.log("✅ SUCCESS: Inventory counts subtracted correctly on Dispatch!");
} else {
  console.log("❌ FAILURE: Inventory discrepancy detected.");
}

// 3. VERIFY COPILOT KNOWLEDGE
console.log("\nVerifying Copilot Query Resolution...");
const copilotResponse = resolveCopilotQuery("What is the status of order ORD0151?", orders);

console.log(`- Copilot Query: "What is the status of order ORD0151?"`);
console.log(`- Copilot Answer:\n"""\n${copilotResponse.text}\n"""`);

if (copilotResponse.text.toLowerCase().includes("dispatched") || copilotResponse.text.toLowerCase().includes("completed")) {
  console.log("✅ SUCCESS: Copilot dynamically reads the updated database and reports order dispatched!");
} else {
  console.log("❌ FAILURE: Copilot reported incorrect status.");
}
console.log("\n====================================================");
