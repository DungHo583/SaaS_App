import { connection } from "next/server";
import AdminDashboardClient from "@/components/AdminDashboardClient";
import { requirePageActor } from "@/lib/page-auth";
import { listTables } from "@/lib/tables";

export const instant = false;

export default async function AdminDashboardPage() {
    await connection();
    const actor = await requirePageActor("admin");
    const tz = actor.settings.timezone;

    const [stats, approvals, tables] = await Promise.all([
        actor.db.query(
            `SELECT
                (SELECT coalesce(sum(total), 0)::bigint FROM bills
                  WHERE status = 'issued' AND (issued_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS revenue,
                (SELECT count(*)::int FROM bills
                  WHERE status = 'issued' AND kind = 'original' AND (issued_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS bills,
                (SELECT count(*)::int FROM table_sessions WHERE status = 'open') AS open_sessions,
                (SELECT count(*)::int FROM order_items
                  WHERE cancel_stage = 'after_cook' AND (cancelled_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS wasted,
                (SELECT count(*)::int FROM order_rounds
                  WHERE status = 'junk' AND (junk_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS junk_rounds`,
            [tz],
        ),
        actor.db.query(
            `SELECT a.id, a.approval_type, a.amount, a.reason, a.requested_at, r.username AS requested_by, a.session_id,
                    (SELECT string_agg(t.name, ' + ') FROM session_tables st JOIN dining_tables t ON t.id = st.table_id
                     WHERE st.session_id = a.session_id AND st.detached_at = (SELECT max(detached_at) FROM session_tables WHERE session_id = a.session_id)) AS table_names
             FROM approvals a JOIN accounts r ON r.id = a.requested_by
             WHERE a.status = 'pending' ORDER BY a.requested_at`,
        ),
        listTables(actor.db),
    ]);
    const row = stats.rows[0];

    return (
        <AdminDashboardClient
            stats={{
                revenue: Number(row.revenue),
                bills: row.bills,
                openSessions: row.open_sessions,
                wasted: row.wasted,
                junkRounds: row.junk_rounds,
                tables: tables.length,
            }}
            approvals={approvals.rows.map((approval) => ({ ...approval, requested_at: approval.requested_at.toISOString() }))}
            tables={tables.map((table) => ({ id: table.id, name: table.name, area: table.area, capacity: table.capacity, busy: Boolean(table.session_id), isActive: table.is_active }))}
        />
    );
}
