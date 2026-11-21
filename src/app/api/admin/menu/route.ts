import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { ok, readJson, route } from "@/lib/http";
import { getMenuItem, listMenuAdmin, parseMenuItem } from "@/lib/menu";

export const GET = route(async () => {
    const actor = await requireActor("admin");
    return ok(await listMenuAdmin(actor.db));
});

export const POST = route(async (request) => {
    const actor = await requireActor("admin");
    const input = parseMenuItem(await readJson(request));
    const item = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            `INSERT INTO menu_items (category_id, name, description, unit, price, image_url, highlight_badge, is_available, manual_portions, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [input.categoryId, input.name, input.description, input.unit, input.price, input.imageUrl, input.highlightBadge, input.isAvailable, input.manualPortions, input.sortOrder],
        );
        const id = result.rows[0].id;
        await audit(client, auditActor(actor, "admin"), {
            action: "menu_item.created",
            entityType: "menu_item",
            entityId: id,
            after: { ...input, imageUrl: input.imageUrl ? "(ảnh)" : null },
        });
        return getMenuItem(client, id);
    });
    return ok({ item }, 201);
});
