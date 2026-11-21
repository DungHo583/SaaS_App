import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, integer, ok, readJson, route, text, uuid } from "@/lib/http";

export const PATCH = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã danh mục");
    const body = await readJson(request);
    const category = await withTransaction(actor.db, async (client) => {
        const before = (await client.query("SELECT id, name, sort_order, is_active FROM menu_categories WHERE id = $1 AND deleted_at IS NULL FOR UPDATE", [id])).rows[0];
        if (!before) throw new HttpError(404, "Không tìm thấy danh mục.");
        const name = "name" in body ? text(body.name, { max: 100, required: true, label: "Tên danh mục" }) : before.name;
        const isActive = "is_active" in body ? body.is_active === true : before.is_active;
        const sortOrder = "sort_order" in body ? integer(body.sort_order, { min: 0, max: 10_000, label: "Thứ tự" }) : before.sort_order;
        const result = await client.query(
            "UPDATE menu_categories SET name = $2, is_active = $3, sort_order = $4 WHERE id = $1 RETURNING id, name, sort_order, is_active",
            [id, name, isActive, sortOrder],
        );
        await audit(client, auditActor(actor, "admin"), { action: "menu_category.updated", entityType: "menu_category", entityId: id, before, after: result.rows[0] });
        return result.rows[0];
    });
    return ok({ category });
});

export const DELETE = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã danh mục");
    await withTransaction(actor.db, async (client) => {
        const used = await client.query("SELECT count(*)::int AS count FROM menu_items WHERE category_id = $1 AND deleted_at IS NULL", [id]);
        if (used.rows[0].count > 0) throw new HttpError(409, `Danh mục còn ${used.rows[0].count} món. Chuyển hoặc xoá món trước.`);
        const result = await client.query("UPDATE menu_categories SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING name", [id]);
        if (!result.rows[0]) throw new HttpError(404, "Không tìm thấy danh mục.");
        await audit(client, auditActor(actor, "admin"), { action: "menu_category.deleted", entityType: "menu_category", entityId: id, before: result.rows[0] });
    });
    return ok({ ok: true });
});
