# Stock Audit Log Feature - Documentation

## Overview

The Stock Audit Log feature automatically tracks all product stock changes, recording **who** made the change, **when** it was made, and **why** it was made. This provides complete transparency and accountability for all inventory adjustments.

## How It Works

### Automatic Logging

When an admin updates a product's stock quantity through the admin dashboard, the system automatically:

1. Records the **previous stock level**
2. Records the **new stock level**
3. Calculates the **quantity added or removed**
4. Captures the **admin's name and email** who made the change
5. Records the **timestamp** of the change
6. Stores an optional **reason** (e.g., "Restock shipment", "Damaged goods adjustment")
7. Determines the **change type**:
   - `add` - Stock was increased
   - `remove` - Stock was decreased
   - `adjustment` - Manual correction

### Last Restock Date

When stock is added (positive change), the product's `last_restock_date` is automatically updated.

## How to Use

### Adding Stock to a Product

1. **Go to Admin Dashboard** → Products section
2. **Click "Edit" on a product** you want to update stock for
3. **Change the "Stock Quantity"** to the new amount
4. **Optional:** Fill in the "Stock Change Reason" field (e.g., "Restock from supplier ABC", "Customer returned 2 units", "Inventory correction")
5. **Click "Update Product"** to save

The system will automatically log this change with your name and the current timestamp.

### Viewing Stock History

#### Via API (for developers/integrations)

**Get all stock changes:**

```
GET /api/admin/stock-history
Query Parameters:
  - limit: Number of records per page (default: 50)
  - offset: Page offset (default: 0)
  - product_id: Filter by product ID (optional)
  - date_from: Start date for filter (optional, ISO 8601 format)
  - date_to: End date for filter (optional, ISO 8601 format)

Response:
{
  "success": true,
  "data": [
    {
      "audit_id": 1,
      "product_id": 5,
      "product": {
        "product_id": 5,
        "product_name": "Rayban Wayfarer",
        "category": "Eyeglasses"
      },
      "admin": {
        "user_id": 1,
        "full_name": "Admin User",
        "email": "admin@ortiz.com"
      },
      "previous_stock": 10,
      "new_stock": 25,
      "quantity_added": 15,
      "change_type": "add",
      "reason": "Restock shipment from supplier",
      "created_at": "2026-05-16T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 50,
    "offset": 0,
    "pages": 1
  }
}
```

**Get history for a specific product:**

```
GET /api/admin/stock-history/:product_id
Query Parameters:
  - limit: Records per page (default: 100)
  - offset: Page offset (default: 0)

Response:
{
  "success": true,
  "product": {
    "product_id": 5,
    "product_name": "Rayban Wayfarer",
    "category": "Eyeglasses"
  },
  "stats": {
    "total_changes": 10,
    "total_added": 150,
    "total_removed": 30,
    "current_stock": 120,
    "last_restock": "2026-05-16T10:30:00.000Z"
  },
  "history": [...],
  "pagination": {...}
}
```

**Get recent stock additions:**

```
GET /api/admin/stock-additions/recent
Query Parameters:
  - limit: Number of recent additions (default: 10)

Response:
{
  "success": true,
  "data": [
    {
      "audit_id": 45,
      "product_id": 5,
      "product": {
        "product_id": 5,
        "product_name": "Rayban Wayfarer",
        "category": "Eyeglasses"
      },
      "admin": {
        "user_id": 1,
        "full_name": "Admin User",
        "email": "admin@ortiz.com"
      },
      "previous_stock": 100,
      "new_stock": 150,
      "quantity_added": 50,
      "created_at": "2026-05-16T14:25:00.000Z"
    }
  ]
}
```

## Database Schema

The `stock_audit_logs` table stores:

- **audit_id** (INT): Primary key, auto-increment
- **product_id** (INT): Reference to product being modified
- **admin_id** (INT): User ID of admin who made the change
- **previous_stock** (INT): Stock level before change
- **new_stock** (INT): Stock level after change
- **quantity_added** (INT): Difference (new - previous), can be negative
- **change_type** (ENUM): 'add', 'remove', or 'adjustment'
- **reason** (VARCHAR): Optional note about the change
- **created_at** (DATETIME): Timestamp of when change was made

**Indexes:** product_id, admin_id, created_at

## Benefits

✅ **Accountability** - Know exactly who changed stock and when
✅ **Discrepancy Detection** - Spot unexpected stock changes
✅ **Audit Trail** - Complete history for compliance and investigations
✅ **Supplier Tracking** - Link restocks to specific suppliers/shipments
✅ **Damage Documentation** - Record when stock is removed due to damage
✅ **Reconciliation** - Easy to match physical inventory counts with records

## Example Use Cases

### Restock Notification

When purchasing sees "quantity_added: 50" with reason "Restock from Supplier XYZ", they know a big order just arrived.

### Damage Investigation

If stock drops unexpectedly, admins can check the audit log to find:

- Who removed the stock
- When it happened
- Reason (e.g., "Damaged during transit")

### Inventory Audit

Finance can review all changes in a date range to reconcile with physical inventory counts.

### Supplier Performance

Track which suppliers consistently deliver correct quantities by reviewing their restock records.

## Notes

- Stock changes are logged **immediately** when the product is updated
- The reason field is **optional** - helpful context, not required
- Only **admins** can view stock audit logs
- The system automatically distinguishes between additions and removals
- This feature works seamlessly with existing product management
