import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import TablesManager from "@/components/admin/TablesManager";

export const instant = false;

export default async function TablesPage() {
    await connection();
    const session = await getSession();
    if (!session) redirect("/admin/login");

    const result = await db.query(
        "SELECT id, name, area, capacity, status, created_at, updated_at FROM restaurant_tables ORDER BY id",
    );

    return <TablesManager initialTables={result.rows} user={session} />;
}
