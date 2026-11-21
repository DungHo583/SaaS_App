import { requireActor } from "@/lib/auth";
import { ok, route } from "@/lib/http";

/** Hàng đợi bếp: món chờ bếp / đang làm / đã xong chờ bưng, theo thứ tự vào bếp. */
export const GET = route(async () => {
    const actor = await requireActor("kitchen");
    const [items, menu] = await Promise.all([
        actor.db.query(
            `SELECT i.id, i.name, i.unit, i.quantity, i.note, i.status, i.queued_at, i.cooking_at, i.ready_at, i.session_id,
                    s.order_type,
                    (SELECT string_agg(t.name, ' + ') FROM session_tables st JOIN dining_tables t ON t.id = st.table_id
                     WHERE st.session_id = i.session_id AND st.detached_at IS NULL) AS table_names
             FROM order_items i JOIN table_sessions s ON s.id = i.session_id
             WHERE i.status IN ('queued', 'cooking', 'ready')
             ORDER BY i.queued_at, i.created_at`,
        ),
        actor.db.query(
            `SELECT mi.id, mi.name, c.name AS category, mi.sold_out_at IS NOT NULL AS sold_out
             FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id
             WHERE mi.deleted_at IS NULL AND mi.is_available ORDER BY c.sort_order, mi.sort_order`,
        ),
    ]);
    return ok({ items: items.rows, menu: menu.rows });
});
