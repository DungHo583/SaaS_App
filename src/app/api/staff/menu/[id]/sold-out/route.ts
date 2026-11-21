import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { HttpError, ok, readJson, route, uuid } from "@/lib/http";

/** Bếp báo hết món / còn món (khác owner tắt món trên menu). */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("kitchen");
    const id = uuid(params.id, "Mã món");
    const soldOut = (await readJson(request)).soldOut === true;
    const result = await actor.db.query(
        soldOut
            ? "UPDATE menu_items SET sold_out_at = now(), sold_out_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING name"
            : "UPDATE menu_items SET sold_out_at = NULL, sold_out_by = NULL WHERE id = $1 AND deleted_at IS NULL RETURNING name",
        soldOut ? [id, actor.account.id] : [id],
    );
    if (!result.rows[0]) throw new HttpError(404, "Không tìm thấy món.");
    await audit(actor.db, auditActor(actor, "kitchen"), {
        action: soldOut ? "menu_item.sold_out" : "menu_item.back_in_stock",
        entityType: "menu_item",
        entityId: id,
        after: { name: result.rows[0].name },
    });
    return ok({ ok: true });
});
