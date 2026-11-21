import { connection } from "next/server";
import TablesManager from "@/components/admin/TablesManager";
import { requirePageActor } from "@/lib/page-auth";
import { listTables } from "@/lib/tables";

export const instant = false;

export default async function AdminTablesPage() {
    await connection();
    const actor = await requirePageActor("admin");
    const tables = await listTables(actor.db);
    return (
        <TablesManager
            initialTables={tables.map((table) => ({
                id: table.id, name: table.name, area: table.area, capacity: table.capacity,
                qr_token: table.qr_token, is_active: table.is_active, session_id: table.session_id,
            }))}
        />
    );
}
