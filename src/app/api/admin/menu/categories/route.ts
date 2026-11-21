import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { ok, readJson, route, text } from "@/lib/http";

export const POST = route(async (request) => {
    const actor = await requireActor("admin");
    const name = text((await readJson(request)).name, { max: 100, required: true, label: "Tên danh mục" });
    const category = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            `INSERT INTO menu_categories (name, sort_order)
             VALUES ($1, (SELECT coalesce(max(sort_order), 0) + 1 FROM menu_categories WHERE deleted_at IS NULL))
             RETURNING id, name, sort_order, is_active`,
            [name],
        );
        await audit(client, auditActor(actor, "admin"), { action: "menu_category.created", entityType: "menu_category", entityId: result.rows[0].id, after: { name } });
        return result.rows[0];
    });
    return ok({ category }, 201);
});
