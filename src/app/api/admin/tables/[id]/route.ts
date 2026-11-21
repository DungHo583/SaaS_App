import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, integer, ok, readJson, route, text, uuid } from "@/lib/http";
import { getTable } from "@/lib/tables";

export const PATCH = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã bàn");
    const body = await readJson(request);
    const table = await withTransaction(actor.db, async (client) => {
        const before = await getTable(client, id);
        if (!before) throw new HttpError(404, "Không tìm thấy bàn.");
        const name = "name" in body ? text(body.name, { max: 50, required: true, label: "Tên bàn" }) : before.name;
        const area = "area" in body ? text(body.area, { max: 50, label: "Khu vực" }) : before.area;
        const capacity = "capacity" in body ? integer(body.capacity, { min: 1, max: 100, label: "Sức chứa" }) : before.capacity;
        const isActive = "isActive" in body ? body.isActive === true : before.is_active;
        if (!isActive && before.session_id) throw new HttpError(409, "Bàn đang có khách, không thể tạm ngưng.");
        await client.query(
            "UPDATE dining_tables SET name = $2, area = $3, capacity = $4, is_active = $5 WHERE id = $1",
            [id, name, area, capacity, isActive],
        );
        await audit(client, auditActor(actor, "admin"), {
            action: "table.updated",
            entityType: "dining_table",
            entityId: id,
            before: { name: before.name, area: before.area, capacity: before.capacity, is_active: before.is_active },
            after: { name, area, capacity, is_active: isActive },
        });
        return getTable(client, id);
    });
    return ok({ table });
});

export const DELETE = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã bàn");
    await withTransaction(actor.db, async (client) => {
        const before = await getTable(client, id);
        if (!before) throw new HttpError(404, "Không tìm thấy bàn.");
        if (before.session_id) throw new HttpError(409, "Bàn đang có khách, không thể xoá.");
        await client.query("UPDATE dining_tables SET deleted_at = now(), is_active = false WHERE id = $1", [id]);
        await audit(client, auditActor(actor, "admin"), { action: "table.deleted", entityType: "dining_table", entityId: id, before: { name: before.name } });
    });
    return ok({ ok: true });
});
