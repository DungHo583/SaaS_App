import { requireActor } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { listSellableMenu } from "@/lib/menu";
import { expireJunkRounds } from "@/lib/ops";
import { can, capabilities } from "@/lib/permissions";
import { listTables } from "@/lib/tables";

/** Danh sách bàn cho nhân viên: phiên đang mở, lượt gọi chờ xác nhận, order rác, đơn mang về. */
export const GET = route(async () => {
    const actor = await requireActor();
    if (!["order", "runner", "cashier"].some((role) => can(actor.account, role as "order"))) {
        throw new HttpError(403, "Tài khoản bếp dùng màn hình Khu vực bếp.", "use_kitchen");
    }
    await expireJunkRounds(actor.db, actor.settings);

    const [tables, sessions, waiting, menu] = await Promise.all([
        listTables(actor.db),
        actor.db.query(
            `SELECT s.id, s.order_type, s.opened_at,
                    count(i.id) FILTER (WHERE i.status IN ('queued', 'cooking')) AS in_kitchen,
                    count(i.id) FILTER (WHERE i.status = 'ready') AS ready,
                    count(i.id) FILTER (WHERE i.status = 'served') AS served,
                    coalesce(sum(i.line_total) FILTER (WHERE i.status <> 'cancelled'), 0)::int AS total,
                    (SELECT count(*) FROM order_rounds r WHERE r.session_id = s.id AND r.status = 'pending') AS pending_rounds,
                    (SELECT b.status FROM bills b WHERE b.session_id = s.id AND b.kind = 'original') AS bill_status
             FROM table_sessions s LEFT JOIN order_items i ON i.session_id = s.id
             WHERE s.status = 'open' GROUP BY s.id ORDER BY s.opened_at`,
        ),
        actor.db.query(
            `SELECT r.id, r.table_id, r.status, r.created_at, r.junk_at,
                    coalesce(json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'note', i.note)
                             ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
             FROM order_rounds r LEFT JOIN order_items i ON i.round_id = r.id
             WHERE r.session_id IS NULL AND r.status IN ('pending', 'junk') AND r.created_at > now() - interval '12 hours'
             GROUP BY r.id ORDER BY r.created_at`,
        ),
        listSellableMenu(actor.db, actor.settings.inventory_enabled),
    ]);
    return ok({
        tables,
        sessions: sessions.rows.map((row) => ({ ...row, in_kitchen: Number(row.in_kitchen), ready: Number(row.ready), served: Number(row.served), pending_rounds: Number(row.pending_rounds) })),
        waitingRounds: waiting.rows,
        menu,
        capabilities: capabilities(actor.account),
    });
});
