import { Router } from "express";
import sql from "../db/index.js";
import { authMiddleware, workspaceScope } from "../middleware/auth.js";
import { requireWorkspaceRoleOrAuditor } from "../middleware/rbac.js";

const router = Router();
router.use(authMiddleware, workspaceScope);

// GET /api/purchase-orders — list POs
router.get("/", async (req, res) => {
  const { ws } = req.workspace;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status;

  let query = sql`
    SELECT po.*, v.name AS vendor_name,
      (SELECT COUNT(*) FROM po_items WHERE po_id = po.id)::int AS line_count
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.workspace_id = ${ws}
  `;
  if (status) query = sql`${query} AND po.status = ${status}`;
  query = sql`${query} ORDER BY po.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const rows = await query;
  const [{ count }] = await sql`SELECT COUNT(*)::int FROM purchase_orders WHERE workspace_id = ${ws}`;
  res.json({ purchase_orders: rows, total: count });
});

// POST /api/purchase-orders — create PO (Agent: Entry Agent captures at source)
router.post("/", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const userId = req.user.userId;
  const { vendor_id, project_id, cost_center_id, expected_delivery, notes, items } = req.body;

  if (!items?.length) return res.status(422).json({ message: "At least one line item required" });

  const [po_number] = await sql`SELECT generate_po_number(${ws}) AS po_number`;

  // Calculate totals
  let subtotal = 0;
  for (const item of items) {
    const lineTotal = (item.quantity || 1) * (item.unit_price_minor || 0);
    subtotal += lineTotal;
  }

  const [po] = await sql`
    INSERT INTO purchase_orders (po_number, workspace_id, vendor_id, project_id, cost_center_id,
      order_date, expected_delivery, subtotal_minor, total_minor, notes, created_by)
    VALUES (${po_number.po_number}, ${ws}, ${vendor_id}, ${project_id}, ${cost_center_id},
      CURRENT_DATE, ${expected_delivery}, ${subtotal}, ${subtotal}, ${notes}, ${userId})
    RETURNING *
  `;

  // Insert line items
  for (const item of items) {
    const lineTotal = (item.quantity || 1) * (item.unit_price_minor || 0);
    await sql`
      INSERT INTO po_items (po_id, item_id, description, quantity, unit, unit_price_minor, total_minor)
      VALUES (${po.id}, ${item.item_id}, ${item.description}, ${item.quantity || 1},
        ${item.unit || "pcs"}, ${item.unit_price_minor || 0}, ${lineTotal})
    `;
  }

  res.status(201).json({ purchase_order: po });
});

// POST /api/purchase-orders/:id/receive — Agent: Goods Receipt reconciliation
router.post("/:id/receive", requireWorkspaceRoleOrAuditor("owner", "manager", "staff"), async (req, res) => {
  const { ws } = req.workspace;
  const userId = req.user.userId;
  const { items, notes } = req.body;

  const [po] = await sql`
    SELECT * FROM purchase_orders WHERE id = ${req.params.id} AND workspace_id = ${ws}
  `;
  if (!po) return res.status(404).json({ message: "PO not found" });

  // Generate GR number
  const [gr_number] = await sql`SELECT generate_gr_number(${ws}) AS gr_number`;

  // Determine status based on receipts
  let poStatus = "partially_received";
  const poItems = await sql`SELECT * FROM po_items WHERE po_id = ${po.id}`;
  let allComplete = true;

  const [gr] = await sql`
    INSERT INTO goods_receipts (gr_number, po_id, workspace_id, received_by, received_date, notes)
    VALUES (${gr_number.gr_number}, ${po.id}, ${ws}, ${userId}, CURRENT_DATE, ${notes})
    RETURNING *
  `;

  for (const item of items) {
    const poItem = poItems.find((pi) => pi.id === item.po_item_id);
    if (!poItem) continue;

    const qtyAccepted = item.quantity_accepted || item.quantity_received || 0;
    const qtyRejected = item.quantity_rejected || 0;
    const qtyReceived = item.quantity_received || (qtyAccepted + qtyRejected);

    await sql`
      INSERT INTO gr_items (gr_id, po_item_id, item_id, description, quantity_received, quantity_accepted, quantity_rejected, rejection_reason)
      VALUES (${gr.id}, ${item.po_item_id}, ${item.item_id}, ${poItem.description},
        ${qtyReceived}, ${qtyAccepted}, ${qtyRejected}, ${item.rejection_reason})
    `;

    // Update received_qty on PO line
    await sql`
      UPDATE po_items SET received_qty = received_qty + ${qtyAccepted} WHERE id = ${item.po_item_id}
    `;

    // Check if all items are fully received
    const updated = await sql`
      SELECT received_qty, quantity FROM po_items WHERE id = ${item.po_item_id}
    `;
    if (updated[0].received_qty < updated[0].quantity) allComplete = false;
  }

  // Update PO status
  poStatus = allComplete ? "fully_received" : "partially_received";
  await sql`
    UPDATE purchase_orders SET status = ${poStatus}::po_status, updated_at = NOW() WHERE id = ${po.id}
  `;

  // Auto-create expense transaction for the GR (Agent: Entry Agent logs to ledger)
  if (po.total_minor > 0 && po.vendor_id) {
    await sql`
      INSERT INTO transactions (user_id, workspace_id, account_id, vendor_id, po_id, txn_type,
        amount_minor, currency, occurred_on, description, is_staged, payment_status)
      VALUES (${userId}, ${ws}, ${po.vendor_id}, ${po.vendor_id}, ${po.id}, 'expense',
        ${po.total_minor}, ${po.currency}, CURRENT_DATE,
        'Goods receipt ' || ${gr_number.gr_number} || ' for PO ' || ${po.po_number},
        true, 'unpaid')
    `;
  }

  res.json({ goods_receipt: gr, po_status: poStatus });
});

// GET /api/purchase-orders/:id — single PO with items + GRs
router.get("/:id", async (req, res) => {
  const { ws } = req.workspace;
  const [po] = await sql`
    SELECT po.*, v.name AS vendor_name, v.contact_person, v.phone AS vendor_phone
    FROM purchase_orders po
    LEFT JOIN vendors v ON v.id = po.vendor_id
    WHERE po.id = ${req.params.id} AND po.workspace_id = ${ws}
  `;
  if (!po) return res.status(404).json({ message: "PO not found" });

  const items = await sql`SELECT * FROM po_items WHERE po_id = ${po.id} ORDER BY id`;
  const receipts = await sql`
    SELECT gr.*, u.email AS received_by_email
    FROM goods_receipts gr
    LEFT JOIN profiles u ON u.id = gr.received_by
    WHERE gr.po_id = ${po.id} ORDER BY gr.created_at DESC
  `;

  res.json({ purchase_order: po, items, goods_receipts: receipts });
});

// PATCH /api/purchase-orders/:id/status — update PO status
router.patch("/:id/status", requireWorkspaceRoleOrAuditor("owner", "manager"), async (req, res) => {
  const { ws } = req.workspace;
  const { status } = req.body;
  const valid = ["draft", "pending_approval", "approved", "ordered", "cancelled"];
  if (!valid.includes(status)) return res.status(422).json({ message: "Invalid status" });

  const [po] = await sql`
    UPDATE purchase_orders SET status = ${status}::po_status, updated_at = NOW()
    WHERE id = ${req.params.id} AND workspace_id = ${ws}
    RETURNING *
  `;
  if (!po) return res.status(404).json({ message: "PO not found" });
  res.json({ purchase_order: po });
});

export default router;
