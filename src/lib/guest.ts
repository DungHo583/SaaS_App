import { audit } from "@/lib/audit";
import { guestKeyHash, requestMeta } from "@/lib/auth";
import type { Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { activeSessionForTable } from "@/lib/ops";

/** Bàn theo QR token (QR in trên bàn). */
export async function tableByToken(db: Queryable, token: string) {
    if (!/^[0-9a-f]{32}$/.test(token)) throw new HttpError(404, "Mã QR không hợp lệ.");
    const table = (await db.query(
        "SELECT id, name, area FROM dining_tables WHERE qr_token = $1 AND deleted_at IS NULL AND is_active",
        [token],
    )).rows[0];
    if (!table) throw new HttpError(404, "Mã QR không hợp lệ hoặc đã được thay mới. Vui lòng hỏi nhân viên.");
    return table as { id: string; name: string; area: string };
}

export async function guestActor() {
    const deviceKeyHash = await guestKeyHash({ create: true });
    const meta = await requestMeta();
    return { type: "customer_device" as const, deviceKeyHash: deviceKeyHash as string, ...meta };
}

/**
 * Quét QR khi bàn đang có phiên → máy khách tham gia phiên hiện tại (BUSINESS_PROCESS 4.1).
 * Máy đã bị nhân viên loại khỏi phiên thì không vào lại được.
 */
export async function joinActiveSession(db: Queryable, tableId: string, actor: Awaited<ReturnType<typeof guestActor>>) {
    const sessionId = await activeSessionForTable(db, tableId);
    if (!sessionId) return { sessionId: null, kicked: false };
    const device = (await db.query(
        "SELECT id, kicked_at FROM session_devices WHERE session_id = $1 AND device_key_hash = $2",
        [sessionId, actor.deviceKeyHash],
    )).rows[0];
    if (device?.kicked_at) return { sessionId, kicked: true };
    if (device) {
        await db.query("UPDATE session_devices SET last_seen_at = now() WHERE id = $1", [device.id]);
    } else {
        await db.query(
            `INSERT INTO session_devices (session_id, device_key_hash, user_agent) VALUES ($1, $2, $3)
             ON CONFLICT (session_id, device_key_hash) DO NOTHING`,
            [sessionId, actor.deviceKeyHash, actor.userAgent.slice(0, 300)],
        );
        await audit(db, actor, { action: "session.device_joined", entityType: "table_session", entityId: sessionId, sessionId });
    }
    return { sessionId, kicked: false };
}
