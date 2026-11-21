import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { HttpError, ok, route, uuid } from "@/lib/http";

/** Loại máy khách lạ khỏi phiên (vd. người dùng ảnh chụp QR từ xa). */
export const DELETE = route<{ id: string; deviceId: string }>(async (_request, params) => {
    const actor = await requireActor("order");
    const sessionId = uuid(params.id, "Mã phiên");
    const deviceId = uuid(params.deviceId, "Mã thiết bị");
    const result = await actor.db.query(
        "UPDATE session_devices SET kicked_at = now(), kicked_by = $3 WHERE id = $1 AND session_id = $2 AND kicked_at IS NULL RETURNING id",
        [deviceId, sessionId, actor.account.id],
    );
    if (!result.rows[0]) throw new HttpError(404, "Không tìm thấy thiết bị trong phiên.");
    await audit(actor.db, auditActor(actor, "order"), { action: "session.device_kicked", entityType: "session_device", entityId: deviceId, sessionId });
    return ok({ ok: true });
});
