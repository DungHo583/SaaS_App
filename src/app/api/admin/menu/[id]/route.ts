import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, uuid } from "@/lib/http";
import { getMenuItem, parseMenuItem } from "@/lib/menu";

const summary = (item: Record<string, unknown>) => ({ ...item, image_url: item.image_url ? "(ảnh)" : null });

export const PATCH = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã món");
    const input = parseMenuItem(await readJson(request));
    const item = await withTransaction(actor.db, async (client) => {
        const before = await getMenuItem(client, id);
        if (!before) throw new HttpError(404, "Không tìm thấy món.");
        await client.query(
            `UPDATE menu_items SET category_id = $2, name = $3, description = $4, unit = $5, price = $6, image_url = $7,
                    highlight_badge = $8, is_available = $9, manual_portions = $10, sort_order = $11
             WHERE id = $1 AND deleted_at IS NULL`,
            [id, input.categoryId, input.name, input.description, input.unit, input.price, input.imageUrl, input.highlightBadge, input.isAvailable, input.manualPortions, input.sortOrder],
        );
        const after = await getMenuItem(client, id);
        await audit(client, auditActor(actor, "admin"), {
            action: before.price !== after.price ? "menu_item.price_changed" : "menu_item.updated",
            entityType: "menu_item",
            entityId: id,
            before: summary(before),
            after: summary(after),
        });
        return after;
    });
    return ok({ item });
});

/** Xoá mềm (deleted_at) — đơn và phiếu cũ vẫn tham chiếu được món. */
export const DELETE = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã món");
    await withTransaction(actor.db, async (client) => {
        const result = await client.query("UPDATE menu_items SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING name", [id]);
        if (!result.rows[0]) throw new HttpError(404, "Không tìm thấy món.");
        await audit(client, auditActor(actor, "admin"), { action: "menu_item.deleted", entityType: "menu_item", entityId: id, before: { name: result.rows[0].name } });
    });
    return ok({ ok: true });
});
