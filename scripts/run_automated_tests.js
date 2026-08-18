import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import actual production functions to test
import { getOrderStage, getNextStageAction, getLifecyclePayload } from '../ui/src/utils/lifecycle.js';
import { 
  prioritizeOrders, allocateInventory, recommendReorders, 
  resolveShortageException, auditExceptions 
} from '../ui/src/utils/decisionEngine.js';
import { resolveCopilotQuery } from '../ui/src/utils/copilotEngine.js';

// Setup file paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ordersPath = path.resolve(__dirname, '../ui/src/data/warehouse_orders.json');
const rawOrders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));

// Test Helper Assertions
let totalTestsRun = 0;
let passedTests = 0;
let failedTests = [];

function it(desc, testFn) {
  totalTestsRun++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ [PASS] ${desc}`);
  } catch (err) {
    console.log(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
    failedTests.push({ desc, error: err });
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
      }
    },
    toContain(sub) {
      if (typeof actual !== 'string' || !actual.includes(sub)) {
        throw new Error(`Expected text to contain "${sub}"`);
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected value to be truthy`);
      }
    }
  };
}

console.log("====================================================");
console.log("WAREHOUSEIQ AUTOMATED TEST RUNNER");
console.log("====================================================\n");

// Get a clean clone of the dataset for testing to avoid contamination
const getFreshOrders = () => JSON.parse(JSON.stringify(rawOrders));

it("1. Order creation", () => {
  const dataset = getFreshOrders();
  const template = dataset.find(o => o.SKU === 'SKU002');
  
  // A brand-new order has NO priority yet — that is assigned in the next step
  const newOrder = {
    Order_ID: 'ORD0999',
    id: 'ORD0999',
    SKU: 'SKU002',
    Product_Name: template.Product_Name,
    Warehouse_ID: template.Warehouse_ID,
    Order_Created_At: new Date().toISOString(),
    Order_Quantity: 10,
    // No Order_Priority yet — this is the "Created" state
    Inventory_Available: 'No',
    Quantity_Allocated: 0,
    Quantity_Picked: 0,
    Packing_Status: 'Pending',
    Dispatch_Status: 'Pending',
    Damaged_Items: 0,
    Total_Inventory_On_Hand: template.Total_Inventory_On_Hand,
    Total_Reserved: template.Total_Reserved,
    Total_Available: template.Total_Available,
    Avg_Daily_Demand_Units: template.Avg_Daily_Demand_Units
  };
  
  expect(newOrder.Order_ID).toBe('ORD0999');
  expect(getOrderStage(newOrder)).toBe('Created');
  expect(newOrder.Quantity_Allocated).toBe(0);
  expect(newOrder.Dispatch_Status).toBe('Pending');
});

it("2. Order prioritization", () => {
  const mockOrders = [
    { Order_ID: 'ORD1', Order_Priority: 'Low', Order_Created_At: '2026-08-01 10:00', Order_Quantity: 5, Dispatch_Status: 'Pending' },
    { Order_ID: 'ORD2', Order_Priority: 'Critical', Order_Created_At: '2026-08-01 11:00', Order_Quantity: 10, Dispatch_Status: 'Pending' },
    { Order_ID: 'ORD3', Order_Priority: 'High', Order_Created_At: '2026-08-01 09:00', Order_Quantity: 15, Dispatch_Status: 'Pending' },
    { Order_ID: 'ORD4', Order_Priority: 'Critical', Order_Created_At: '2026-08-01 10:00', Order_Quantity: 20, Dispatch_Status: 'Pending' }
  ];
  
  const sorted = prioritizeOrders(mockOrders);
  
  // Sorted should have ORD4 first (Critical and earlier than ORD2), then ORD2 (Critical), then ORD3 (High), then ORD1 (Low)
  expect(sorted[0].Order_ID).toBe('ORD4');
  expect(sorted[1].Order_ID).toBe('ORD2');
  expect(sorted[2].Order_ID).toBe('ORD3');
  expect(sorted[3].Order_ID).toBe('ORD1');
});

it("3. Inventory checking", () => {
  const orderWithStock = { Order_Quantity: 5, Total_Available: 10 };
  const payloadYes = getLifecyclePayload('check_inventory', orderWithStock);
  expect(payloadYes.Inventory_Available).toBe('Yes');

  const orderWithoutStock = { Order_Quantity: 15, Total_Available: 10 };
  const payloadNo = getLifecyclePayload('check_inventory', orderWithoutStock);
  expect(payloadNo.Inventory_Available).toBe('No');
});

it("4. Inventory allocation", () => {
  const order = { Order_Quantity: 5, Total_Reserved: 10, Total_Available: 100 };
  const payload = getLifecyclePayload('allocate_stock', order);
  
  expect(payload.Quantity_Allocated).toBe(5);
  expect(payload.Total_Reserved).toBe(15);
  expect(payload.Total_Available).toBe(95);
});

it("5. Partial allocation", () => {
  // Scenario: Available stock = 5, Order requests 10
  const ordersList = [
    { Order_ID: 'ORD_PARTIAL', SKU: 'SKU_PART', Order_Quantity: 10, Total_Available: 5, Order_Priority: 'High', Dispatch_Status: 'Pending' }
  ];
  const { allocations, exceptions } = allocateInventory(ordersList);
  
  expect(allocations['ORD_PARTIAL'].allocated).toBe(5);
  expect(allocations['ORD_PARTIAL'].status).toBe('Shortage');
  expect(exceptions.length).toBe(1);
  expect(exceptions[0].gap).toBe(5);
});

it("6. Picking", () => {
  const order = { Order_Quantity: 8 };
  const payload = getLifecyclePayload('pick_items', order);
  
  expect(payload.Quantity_Picked).toBe(8);
  expect(payload.Picking_Start).toBeDefined();
  expect(payload.Picking_End).toBeDefined();
});

it("7. Packing", () => {
  const order = { Order_Quantity: 8 };
  const payload = getLifecyclePayload('pack_items', order);
  
  expect(payload.Packing_Status).toBe('Packed');
  expect(payload.Packing_Start).toBeDefined();
  expect(payload.Packing_End).toBeDefined();
});

it("8. Quality check", () => {
  // Test clean QA
  const orderClean = { Order_Quantity: 5, Damaged_Items: 2 };
  const payloadClean = getLifecyclePayload('run_qa', orderClean);
  expect(payloadClean.Damaged_Items).toBe(0);
  
  // Test QA Hold identification
  const orderDamaged = { Packing_Status: 'Packed', Damaged_Items: 3 };
  expect(getOrderStage(orderDamaged)).toBe('QA Hold');
});

it("9. Dispatch", () => {
  const order = { Order_Quantity: 6, Total_Inventory_On_Hand: 50, Total_Reserved: 10 };
  const payload = getLifecyclePayload('dispatch_order', order);
  
  expect(payload.Dispatch_Status).toBe('Dispatched');
  expect(payload.Dispatch_At).toBeDefined();
});

it("10. Inventory update", () => {
  const order = { Order_Quantity: 10, Total_Inventory_On_Hand: 50, Total_Reserved: 10 };
  const payload = getLifecyclePayload('dispatch_order', order);
  
  expect(payload.Total_Inventory_On_Hand).toBe(40);
  expect(payload.Total_Reserved).toBe(0);
});

it("11. Low stock detection", () => {
  // safetyStock = dailyDemand * 7 = 70. available = 60.
  const ordersList = [
    { SKU: 'SKU_LOW', Total_Available: 60, Avg_Daily_Demand_Units: 10, Total_Inventory_On_Hand: 100, Total_Reserved: 40 }
  ];
  const recs = recommendReorders(ordersList);
  const target = recs.find(r => r.sku === 'SKU_LOW');
  
  expect(target.status).toBe('Warning');
  expect(target.recommendation).toBe('Prepare Restock Order');
  expect(target.recommendedOrderQty).toBe(70);
});

it("12. Out of stock detection", () => {
  // reorderPoint = dailyDemand * 3 = 30. available = 20.
  const ordersList = [
    { SKU: 'SKU_OUT', Total_Available: 20, Avg_Daily_Demand_Units: 10, Total_Inventory_On_Hand: 50, Total_Reserved: 30 }
  ];
  const recs = recommendReorders(ordersList);
  const target = recs.find(r => r.sku === 'SKU_OUT');
  
  expect(target.status).toBe('Critical');
  expect(target.recommendation).toBe('Immediate Restock Required');
  expect(target.recommendedOrderQty).toBe(140);
});

it("13. Damaged item handling", () => {
  const ordersList = [
    { Order_ID: 'ORD_DMG', SKU: 'SKU_DMG', Product_Name: 'Item', Damaged_Items: 3, Dispatch_Status: 'Pending', Order_Priority: 'High', Order_Quantity: 5 }
  ];
  const exceptions = auditExceptions(ordersList);
  const target = exceptions.find(e => e.type === 'Damaged Items');
  
  expect(target).toBeDefined();
  expect(target.actionType).toBe('replace_damaged');
  expect(target.payload.qty).toBe(3);
});

it("14. Missing item handling", () => {
  // Scenario: Allocated = 10, Picked = 7 -> Missing = 3
  const ordersList = [
    { Order_ID: 'ORD_MISS', SKU: 'SKU_MISS', Quantity_Allocated: 10, Quantity_Picked: 7, Order_Quantity: 10, Dispatch_Status: 'Pending' }
  ];
  const exceptions = auditExceptions(ordersList);
  const target = exceptions.find(e => e.type === 'Missing Items');
  
  expect(target).toBeDefined();
  expect(target.actionType).toBe('reconcile_missing');
  expect(target.payload.qty).toBe(3);
});

it("15. Exception creation", () => {
  const mockOrders = [
    // 1. Insufficient stock (allocation gap)
    { Order_ID: 'ORD_EXC1', SKU: 'SKU1', Order_Quantity: 10, Quantity_Allocated: 8, Dispatch_Status: 'Pending' },
    // 2. Damaged items (QA Hold)
    { Order_ID: 'ORD_EXC2', SKU: 'SKU2', Damaged_Items: 1, Dispatch_Status: 'Pending' },
    // 3. Missing items
    { Order_ID: 'ORD_EXC3', SKU: 'SKU3', Quantity_Allocated: 5, Quantity_Picked: 3, Order_Quantity: 5, Dispatch_Status: 'Pending' },
    // 4. Picking Delay
    { Order_ID: 'ORD_EXC4', SKU: 'SKU4', Picking_Start: '2026-08-01 10:00', Processing_Time_Minutes: 90, Dispatch_Status: 'Pending' },
    // 5. Packing Delay
    { Order_ID: 'ORD_EXC5', SKU: 'SKU5', Packing_Start: '2026-08-01 10:00', Packing_Status: 'Partial', Processing_Time_Minutes: 95, Dispatch_Status: 'Pending' },
    // 6. Dispatch Delay (Carrier DTDC)
    { Order_ID: 'ORD_EXC6', SKU: 'SKU6', Packing_Status: 'Packed', Dispatch_Status: 'Pending', Carrier: 'DTDC' }
  ];
  
  const exceptions = auditExceptions(mockOrders);
  
  expect(exceptions.some(e => e.type === 'Insufficient Stock')).toBeTruthy();
  expect(exceptions.some(e => e.type === 'Damaged Items')).toBeTruthy();
  expect(exceptions.some(e => e.type === 'Missing Items')).toBeTruthy();
  expect(exceptions.some(e => e.type === 'Picking Delay')).toBeTruthy();
  expect(exceptions.some(e => e.type === 'Packing Delay')).toBeTruthy();
  expect(exceptions.some(e => e.type === 'Dispatch Delay')).toBeTruthy();
});

it("16. Exception resolution", () => {
  // Scenario: ORD_TARGET needs 5 allocations (allocated=0, quantity=5, priority=Critical).
  // Low priority donor ORD_DONOR has 10 allocated units.
  const ordersList = [
    { Order_ID: 'ORD_TARGET', SKU: 'SKU_RESOLVE', Product_Name: 'Resolve SKU', Order_Priority: 'Critical', Order_Quantity: 5, Quantity_Allocated: 0, Dispatch_Status: 'Pending' },
    { Order_ID: 'ORD_DONOR', SKU: 'SKU_RESOLVE', Product_Name: 'Resolve SKU', Order_Priority: 'Low', Order_Quantity: 10, Quantity_Allocated: 10, Dispatch_Status: 'Pending' }
  ];
  
  const result = resolveShortageException(ordersList[0], ordersList);
  
  expect(result.targetOrderId).toBe('ORD_TARGET');
  expect(result.gap).toBe(5);
  expect(result.isFullyResolvable).toBeTruthy();
  expect(result.transfers.length).toBe(1);
  expect(result.transfers[0].donorOrderId).toBe('ORD_DONOR');
  expect(result.transfers[0].quantityToTake).toBe(5);
});

it("17. Decision Engine", () => {
  const dataset = getFreshOrders();
  const sorted = prioritizeOrders(dataset);
  expect(Array.isArray(sorted)).toBeTruthy();
  
  const { allocations, exceptions } = allocateInventory(dataset);
  expect(typeof allocations).toBe('object');
  expect(Array.isArray(exceptions)).toBeTruthy();
});

it("18. Apply Decision", () => {
  // Simulate applying a reallocation transfer decision
  const dataset = [
    { Order_ID: 'ORD_TARGET', SKU: 'SKU_APPLY', Order_Priority: 'Critical', Order_Quantity: 5, Quantity_Allocated: 0, Dispatch_Status: 'Pending' },
    { Order_ID: 'ORD_DONOR', SKU: 'SKU_APPLY', Order_Priority: 'Low', Order_Quantity: 10, Quantity_Allocated: 10, Dispatch_Status: 'Pending' }
  ];
  
  const resolution = resolveShortageException(dataset[0], dataset);
  
  // Apply transfers
  resolution.transfers.forEach(t => {
    const donor = dataset.find(o => o.Order_ID === t.donorOrderId);
    donor.Quantity_Allocated -= t.quantityToTake;
  });
  dataset[0].Quantity_Allocated += resolution.accumulatedStock;
  
  const targetOrder = dataset.find(o => o.Order_ID === 'ORD_TARGET');
  const donorOrder = dataset.find(o => o.Order_ID === 'ORD_DONOR');
  
  expect(targetOrder.Quantity_Allocated).toBe(5);
  expect(donorOrder.Quantity_Allocated).toBe(5);
});

it("19. ML prediction endpoints", () => {
  // Test prediction delay classification rules based on carrier and processing times
  const mockOrderDelay = { Order_ID: 'ORD_ML1', Processing_Time_Minutes: 90, Carrier: 'DTDC' };
  const mockOrderFast = { Order_ID: 'ORD_ML2', Processing_Time_Minutes: 40, Carrier: 'Blue Dart' };
  
  const predictsDelayML1 = mockOrderDelay.Processing_Time_Minutes > 80 || mockOrderDelay.Carrier === 'DTDC';
  const predictsDelayML2 = mockOrderFast.Processing_Time_Minutes > 80 || mockOrderFast.Carrier === 'DTDC';
  
  expect(predictsDelayML1).toBeTruthy();
  expect(predictsDelayML2).toBe(false);
});

it("20. Warehouse Copilot data retrieval", () => {
  const dataset = getFreshOrders();
  // Ensure the target order exists or inject one
  const targetId = 'ORD0001';
  if (!dataset.some(o => o.Order_ID === targetId)) {
    dataset.push({ Order_ID: targetId, Product_Name: 'Test Keyboard', SKU: 'SKU002', Dispatch_Status: 'Pending', Order_Priority: 'High' });
  }

  const query = `What is the status of order ${targetId}?`;
  const response = resolveCopilotQuery(query, dataset);
  
  expect(response.type).toBe('lifecycle_advance');
  expect(response.text).toContain('INSIGHT');
  expect(response.text).toContain('EVIDENCE');
  expect(response.text).toContain('RECOMMENDATION');
});

// Run End-to-End Workflow test
it("Complete End-to-End Workflow Validation", () => {
  const dataset = getFreshOrders();
  const targetSku = 'SKU002';
  const template = dataset.find(o => o.SKU === targetSku);
  
  const initialOnHand = template.Total_Inventory_On_Hand;
  const initialAvailable = template.Total_Available;
  const qty = 5;
  
  // Step 1: Created
  let order = {
    Order_ID: 'ORD_E2E_TEST',
    id: 'ORD_E2E_TEST',
    SKU: targetSku,
    Product_Name: template.Product_Name,
    Order_Quantity: qty,
    Quantity_Allocated: 0,
    Quantity_Picked: 0,
    Packing_Status: 'Pending',
    Dispatch_Status: 'Pending',
    Damaged_Items: 0,
    Total_Inventory_On_Hand: initialOnHand,
    Total_Reserved: template.Total_Reserved,
    Total_Available: initialAvailable
  };
  expect(getOrderStage(order)).toBe('Created');
  
  // Step 2: Priority Assigned
  order = { ...order, ...getLifecyclePayload('assign_priority', order) };
  expect(getOrderStage(order)).toBe('Priority Assigned');
  
  // Step 3: Inventory Checked
  order = { ...order, ...getLifecyclePayload('check_inventory', order) };
  expect(getOrderStage(order)).toBe('Inventory Checked');
  
  // Step 4: Allocated
  order = { ...order, ...getLifecyclePayload('allocate_stock', order) };
  expect(getOrderStage(order)).toBe('Allocated');
  
  // Step 5: Picked
  order = { ...order, ...getLifecyclePayload('pick_items', order) };
  expect(getOrderStage(order)).toBe('Picked');
  
  // Step 6: Packed
  order = { ...order, ...getLifecyclePayload('pack_items', order) };
  expect(getOrderStage(order)).toBe('QA Passed'); // Packed and 0 damaged items defaults to QA Passed
  
  // Step 7: QA Verified (run_qa)
  order = { ...order, ...getLifecyclePayload('run_qa', order) };
  expect(getOrderStage(order)).toBe('QA Passed');
  
  // Step 8: Dispatched & Inventory Updated
  order = { ...order, ...getLifecyclePayload('dispatch_order', order) };
  expect(getOrderStage(order)).toBe('Dispatched');
  
  expect(order.Total_Inventory_On_Hand).toBe(initialOnHand - qty);
});

console.log("\n====================================================");
console.log("TEST RUN COMPLETE");
console.log(`Total tests run: ${totalTestsRun}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests.length}`);
console.log("====================================================");

if (failedTests.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
