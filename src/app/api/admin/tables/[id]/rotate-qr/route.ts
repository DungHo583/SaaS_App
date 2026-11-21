import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, route, uuid } from "@/lib/http";
import { getTable } from "@/lib/tables";

/** Sinh lại QR token của bàn (QR cũ bị lộ / in lại). QR cũ mất hiệu lực ngay. */
export const POST = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã bàn");
    const table = await withTransaction(actor.db, async (client) => {
        const result = await client.query(
            "UPDATE dining_tables SET qr_token = replace(gen_random_uuid()::text, '-', '') WHERE id = $1 AND deleted_at IS NULL RETURNING id",
            [id],
        );
        if (!result.rows[0]) throw new HttpError(404, "Không tìm thấy bàn.");
        await audit(client, auditActor(actor, "admin"), { action: "table.qr_rotated", entityType: "dining_table", entityId: id });
        return getTable(client, id);
    });
    return ok({ table });
});
