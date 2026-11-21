import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, uuid } from "@/lib/http";

/** Duyệt hoặc thu hồi thiết bị đăng nhập của nhân viên. Thu hồi = kết thúc ca trên thiết bị đó. */
export const PATCH = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã thiết bị");
    const action = String((await readJson(request)).action ?? "");
    if (!["approve", "revoke", "restore"].includes(action)) throw new HttpError(400, "Thao tác không hợp lệ.");

    const device = await withTransaction(actor.db, async (client) => {
        const result = action === "approve"
            ? await client.query("UPDATE devices SET approved_at = now(), approved_by = $2 WHERE id = $1 RETURNING *", [id, actor.account.id])
            : action === "revoke"
                ? await client.query("UPDATE devices SET revoked_at = now(), revoked_by = $2 WHERE id = $1 RETURNING *", [id, actor.account.id])
                : await client.query("UPDATE devices SET revoked_at = NULL, revoked_by = NULL WHERE id = $1 RETURNING *", [id]);
        if (!result.rows[0]) throw new HttpError(404, "Không tìm thấy thiết bị.");
        if (action === "revoke") {
            await client.query("UPDATE shifts SET ended_at = now(), end_reason = 'revoked' WHERE device_id = $1 AND ended_at IS NULL", [id]);
        }
        await audit(client, auditActor(actor, "admin"), { action: `device.${action === "approve" ? "approved" : action === "revoke" ? "revoked" : "restored"}`, entityType: "device", entityId: id });
        return result.rows[0];
    });
    return ok({ device: { id: device.id, approved_at: device.approved_at, revoked_at: device.revoked_at } });
});
