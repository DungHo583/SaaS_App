import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, uuid } from "@/lib/http";

/** Owner duyệt / từ chối yêu cầu (đóng phiên bất thường → ghi nhận thất thoát). */
export const POST = route<{ id: string }>(async (request, params) => {
    const actor = await requireActor("admin");
    const id = uuid(params.id, "Mã yêu cầu");
    const body = await readJson(request);
    const decision = String(body.decision ?? "");
    if (!["approved", "rejected"].includes(decision)) throw new HttpError(400, "Quyết định không hợp lệ.");
    const note = optionalText(body.note, { max: 500, label: "Ghi chú" });
    if (decision === "rejected" && !note) throw new HttpError(400, "Từ chối phải ghi lý do để nhân viên giải trình.");

    await withTransaction(actor.db, async (client) => {
        const approval = (await client.query(
            "UPDATE approvals SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1 AND status = 'pending' RETURNING *",
            [id, decision, actor.account.id, note],
        )).rows[0];
        if (!approval) throw new HttpError(404, "Yêu cầu không tồn tại hoặc đã được xử lý.");
        if (approval.approval_type === "abnormal_close") {
            await client.query("UPDATE table_sessions SET status = $2 WHERE id = $1", [
                approval.session_id,
                decision === "approved" ? "abnormal_closed" : "abnormal_rejected",
            ]);
        }
        await audit(client, auditActor(actor, "admin"), {
            action: `approval.${decision}`,
            entityType: "approval",
            entityId: id,
            sessionId: approval.session_id,
            after: { type: approval.approval_type, amount: approval.amount },
            reason: note,
            retention: "financial",
        });
    });
    return ok({ ok: true });
});
