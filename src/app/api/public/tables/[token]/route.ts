import { guestActor, joinActiveSession, tableByToken } from "@/lib/guest";
import { ok, route } from "@/lib/http";
import { expireJunkRounds } from "@/lib/ops";
import { loadSettings } from "@/lib/settings";
import { getTenantDb } from "@/lib/tenant";

/**
 * Trạng thái bàn cho máy khách: phiên hiện tại (tự tham gia khi quét QR), món đã gọi + trạng thái,
 * nhãn "món đã gọi", các lượt gọi của máy này đang chờ xác nhận.
 */
export const GET = route<{ token: string }>(async (_request, params) => {
    const { db } = await getTenantDb();
    const table = await tableByToken(db, params.token);
    const actor = await guestActor();
    await expireJunkRounds(db, await loadSettings(db));
    const { sessionId, kicked } = await joinActiveSession(db, table.id, actor);

    const [items, badges, rounds, bill] = await Promise.all([
        sessionId && !kicked
            ? db.query(
                `SELECT id, name, unit, quantity, unit_price, line_total, note, status, created_at, cancel_stage
                 FROM order_items WHERE session_id = $1 ORDER BY created_at`,
                [sessionId],
            )
            : { rows: [] },
        sessionId && !kicked
            ? db.query("SELECT menu_item_id, unserved_quantity FROM session_ordered_badges WHERE session_id = $1", [sessionId])
            : { rows: [] },
        db.query(
            `SELECT r.id, r.status, r.created_at, r.reject_reason,
                    coalesce(json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unit_price', i.unit_price)
                             ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
             FROM order_rounds r LEFT JOIN order_items i ON i.round_id = r.id
             WHERE r.table_id = $1 AND r.customer_device_key_hash = $2 AND r.status IN ('pending', 'junk', 'rejected')
               AND r.created_at > now() - interval '3 hours'
             GROUP BY r.id ORDER BY r.created_at DESC`,
            [table.id, actor.deviceKeyHash],
        ),
        sessionId && !kicked
            ? db.query("SELECT status, total FROM bills WHERE session_id = $1 AND kind = 'original'", [sessionId])
            : { rows: [] },
    ]);

    return ok({
        table: { name: table.name, area: table.area },
        session: sessionId && !kicked ? { active: true } : null,
        kicked,
        items: items.rows,
        badges: Object.fromEntries(badges.rows.map((row) => [row.menu_item_id, row.unserved_quantity])),
        rounds: rounds.rows,
        bill: bill.rows[0] ?? null,
    });
});
