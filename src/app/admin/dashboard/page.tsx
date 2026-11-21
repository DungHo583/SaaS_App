import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AdminDashboardClient from "@/components/AdminDashboardClient";
import { connection } from "next/server";

export const instant = false;

export default async function AdminDashboardPage() {
    await connection();
    const session = await getSession();
    if (!session) redirect("/admin/login");

    let tables: Array<{ id: number; name: string; capacity: number; status: string }> = [];
    let orderCount = 0;
    let revenue = 0;

    try {
        const [tableResult, orderResult] = await Promise.all([
            db.query("SELECT id, name, capacity, status FROM restaurant_tables ORDER BY id"),
            db.query("SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0)::int AS revenue FROM orders"),
        ]);
        tables = tableResult.rows;
        orderCount = orderResult.rows[0]?.count ?? 0;
        revenue = orderResult.rows[0]?.revenue ?? 0;
    } catch (error) {
        console.error("Dashboard database query failed:", error);
    }

    return (
        <AdminDashboardClient
            user={{ name: session.name, email: session.email }}
            tables={tables}
            orderCount={orderCount}
            revenue={revenue}
        />
    );
}
