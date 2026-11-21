import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, optionalText, readJson, route, uuid } from "@/lib/http";
import { transitionItem, type ItemAction } from "@/lib/ops";
import type { Capability } from "@/lib/permissions";

/**
 * Chuyển trạng thái món. Quyền theo thao tác (BUSINESS_PROCESS 2.2):
 * - start / ready / sold_out / huỷ món đang-đã nấu: bếp (owner/quản lý = bất khả kháng, đánh dấu trong log)
 * - serve: chạy bàn
 * - huỷ món chưa nấu: gọi món
 */
export const POST = route<{ id: string }>(async (request, params) => {
    const itemId = uuid(params.id, "Mã món");
    const body = await readJson(request);
    const action = String(body.action ?? "") as ItemAction;
    if (!["start", "ready", "serve", "cancel", "sold_out"].includes(action)) throw new HttpError(400, "Thao tác không hợp lệ.");
    const reason = optionalText(body.reason, { max: 300, label: "Lý do" });

    // Quyền phụ thuộc trạng thái hiện tại của món khi huỷ: đọc trước, kiểm tra lại trong transaction.
    const probe = await requireActor();
    const current = (await probe.db.query("SELECT status FROM order_items WHERE id = $1", [itemId])).rows[0];
    if (!current) throw new HttpError(404, "Không tìm thấy món.");
    const capability: Capability = action === "serve" ? "runner"
        : action === "cancel" && ["pending", "queued"].includes(current.status) ? "order"
            : "kitchen";
    const actor = await requireActor(capability);

    const result = await withTransaction(actor.db, async (client) => {
        const { item, before } = await transitionItem(client, actor.settings, itemId, action, actor.account.id, reason);
        if (action === "cancel" && before !== current.status) throw new HttpError(409, "Trạng thái món vừa thay đổi, vui lòng thử lại.");
        await audit(client, auditActor(actor, capability), {
            action: `item.${action}`,
            entityType: "order_item",
            entityId: itemId,
            sessionId: item.session_id,
            before: { status: before },
            after: { name: item.name, quantity: item.quantity },
            reason,
        });
        return { status: before };
    });
    return ok(result);
});
