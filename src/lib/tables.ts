import type { Queryable } from "@/lib/db";

/** Bàn + phiên đang mở (nếu có). Trạng thái bàn suy ra từ phiên, không lưu riêng. */
export const TABLE_SELECT = `
    SELECT t.id, t.name, t.area, t.capacity, t.qr_token, t.sort_order, t.is_active,
           st.session_id, s.opened_at AS session_opened_at
    FROM dining_tables t
    LEFT JOIN session_tables st ON st.table_id = t.id AND st.detached_at IS NULL
    LEFT JOIN table_sessions s ON s.id = st.session_id
    WHERE t.deleted_at IS NULL`;

export async function listTables(db: Queryable) {
    return (await db.query(`${TABLE_SELECT} ORDER BY t.sort_order, t.name`)).rows;
}

export async function getTable(db: Queryable, id: string) {
    return (await db.query(`${TABLE_SELECT} AND t.id = $1`, [id])).rows[0];
}
