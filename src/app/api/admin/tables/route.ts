import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { integer, ok, readJson, route, text } from "@/lib/http";
import { getTable, listTables } from "@/lib/tables";

export const GET = route(async () => {
    const actor = await requireActor("admin");
    return ok({ tables: await listTables(actor.db) });
});

export const POST = route(async (request) => {
    const actor = await requireActor("admin");
    const body = await readJson(request);
    const name = text(body.name, { max: 50, required: true, label: "Tên bàn" });
    const area = text(body.area, { max: 50, label: "Khu vực" });
    const capacity = integer(body.capacity, { min: 1, max: 100, label: "Sức chứa" });
    const table = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            `INSERT INTO dining_tables (name, area, capacity, sort_order)
             VALUES ($1, $2, $3, (SELECT coalesce(max(sort_order), 0) + 1 FROM dining_tables WHERE deleted_at IS NULL))
             RETURNING id`,
            [name, area, capacity],
        );
        await audit(client, auditActor(actor, "admin"), { action: "table.created", entityType: "dining_table", entityId: result.rows[0].id, after: { name, area, capacity } });
        return getTable(client, result.rows[0].id);
    });
    return ok({ table }, 201);
});
