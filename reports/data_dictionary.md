# WarehouseIQ Data Dictionary

- Source file: /Users/hasiniaddanki/Desktop/warehouse/warehouse_decision_engine_sample_dataset.csv
- File size (bytes): 36668
- Rows: 150
- Columns: 28
- Duplicate rows: 0

## Column Dictionary

| Column | Detected Type | Pandas DType | Missing % | Unique (non-null) | ID-like |
|---|---|---|---:|---:|---:|
| Order_ID | categorical/text | object | 0.0 | 150 | True |
| SKU | categorical/text | object | 0.0 | 15 | False |
| Product_Name | categorical/text | object | 0.0 | 15 | False |
| Warehouse_ID | categorical/text | object | 0.0 | 5 | False |
| Warehouse_Name | categorical/text | object | 0.0 | 5 | False |
| Warehouse_City | categorical/text | object | 0.0 | 5 | False |
| Order_Created_At | datetime-like | datetime-candidate | 0.0 | 150 | False |
| Order_Quantity | numeric | int64 | 0.0 | 12 | False |
| Order_Priority | categorical/text | object | 0.0 | 4 | False |
| Inventory_Available | categorical/text | object | 0.0 | 2 | False |
| Quantity_Allocated | numeric | int64 | 0.0 | 13 | False |
| Quantity_Picked | numeric | int64 | 0.0 | 13 | False |
| Damaged_Items | numeric | int64 | 0.0 | 3 | False |
| Packing_Status | categorical/text | object | 0.0 | 3 | False |
| Picking_Start | datetime-like | datetime-candidate | 0.0 | 146 | False |
| Picking_End | datetime-like | datetime-candidate | 0.0 | 150 | False |
| Packing_Start | datetime-like | datetime-candidate | 0.0 | 150 | False |
| Packing_End | datetime-like | datetime-candidate | 0.0 | 149 | False |
| Processing_Time_Minutes | numeric | int64 | 0.0 | 66 | False |
| Dispatch_Status | categorical/text | object | 0.0 | 2 | False |
| Carrier | categorical/text | object | 0.0 | 5 | False |
| Dispatch_At | datetime-like | datetime-candidate | 31.33 | 102 | False |
| Estimated_Delivery | datetime-like | datetime-candidate | 31.33 | 103 | False |
| Total_Inventory_On_Hand | numeric | int64 | 0.0 | 14 | False |
| Total_Reserved | numeric | int64 | 0.0 | 15 | False |
| Total_Available | numeric | int64 | 0.0 | 15 | False |
| Avg_Daily_Demand_Units | numeric | float64 | 0.0 | 14 | False |
| Total_120_Day_Demand | numeric | int64 | 0.0 | 14 | False |

## Auto-detected Groups

- Categorical columns: Order_ID, SKU, Product_Name, Warehouse_ID, Warehouse_Name, Warehouse_City, Order_Priority, Inventory_Available, Packing_Status, Dispatch_Status, Carrier
- Numerical columns: Order_Quantity, Quantity_Allocated, Quantity_Picked, Damaged_Items, Processing_Time_Minutes, Total_Inventory_On_Hand, Total_Reserved, Total_Available, Avg_Daily_Demand_Units, Total_120_Day_Demand
- Datetime-like columns: Order_Created_At, Picking_Start, Picking_End, Packing_Start, Packing_End, Dispatch_At, Estimated_Delivery
- ID-like columns: Order_ID