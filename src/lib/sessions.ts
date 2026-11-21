import type { Queryable } from "@/lib/db";
import { sessionTableNames } from "@/lib/ops";

/** Chi tiết phiên cho màn hình nhân viên: món, lượt gọi, máy khách, phiếu, thanh toán. */
export async function loadSessionDetail(db: Queryable, sessionId: string) {
    const session = (await db.query(
        `SELECT s.id, s.order_type, s.status, s.opened_at, s.closed_at, s.guest_count, s.note, a.username AS opened_by
         FROM table_sessions s JOIN accounts a ON a.id = s.opened_by WHERE s.id = $1`,
        [sessionId],
    )).rows[0];
    if (!session) return null;

    const [tables, items, rounds, devices, bill] = await Promise.all([
        db.query(
            `SELECT t.id, t.name FROM session_tables st JOIN dining_tables t ON t.id = st.table_id
             WHERE st.session_id = $1 AND st.detached_at IS NULL ORDER BY st.attached_at`,
            [sessionId],
        ),
        db.query(
            `SELECT i.id, i.round_id, i.menu_item_id, i.name, i.unit, i.unit_price, i.quantity, i.line_total, i.note,
                    i.status, i.cancel_stage, i.cancel_reason, i.created_at, r.source
             FROM order_items i JOIN order_rounds r ON r.id = i.round_id
             WHERE i.session_id = $1 ORDER BY i.created_at`,
            [sessionId],
        ),
        db.query(
            `SELECT r.id, r.source, r.status, r.created_at, r.junk_at,
                    coalesce(json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'note', i.note)
                             ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
             FROM order_rounds r LEFT JOIN order_items i ON i.round_id = r.id
             WHERE r.session_id = $1 AND r.status IN ('pending', 'junk')
             GROUP BY r.id ORDER BY r.created_at`,
            [sessionId],
        ),
        db.query(
            "SELECT id, user_agent, joined_at, last_seen_at, kicked_at FROM session_devices WHERE session_id = $1 ORDER BY joined_at",
            [sessionId],
        ),
        db.query(
            `SELECT b.id, b.status, b.series, b.number, b.subtotal, b.discount, b.total, b.issued_at,
                    coalesce(json_agg(json_build_object('id', p.id, 'method', p.method, 'amount', p.amount, 'status', p.status,
                             'cash_received', p.cash_received, 'change_given', p.change_given, 'transfer_content', p.transfer_content)
                             ORDER BY p.created_at) FILTER (WHERE p.id IS NOT NULL), '[]') AS payments
             FROM bills b LEFT JOIN payments p ON p.bill_id = b.id
             WHERE b.session_id = $1 AND b.kind = 'original' GROUP BY b.id`,
            [sessionId],
        ),
    ]);
    return {
        session: { ...session, table_names: await sessionTableNames(db, sessionId) },
        tables: tables.rows,
        items: items.rows,
        pendingRounds: rounds.rows,
        devices: devices.rows,
        bill: bill.rows[0] ?? null,
    };
}
