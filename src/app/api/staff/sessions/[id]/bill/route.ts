import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, route, uuid } from "@/lib/http";
import { refreshDraftBill } from "@/lib/ops";
import { loadReceipt } from "@/lib/receipt/load";

/** Phiếu (tạm tính / đã phát hành) của phiên, render 80mm. */
export const GET = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("cashier");
    const receipt = await loadReceipt(actor.db, uuid(params.id, "Mã phiên"));
    if (!receipt) throw new HttpError(404, "Phiên chưa có phiếu.");
    return ok({ billId: receipt.bill.id, status: receipt.bill.status, title: receipt.receipt.title, total: receipt.receipt.total, html: receipt.html, text: receipt.text });
});

/** Lập / cập nhật phiếu tạm tính từ các món chưa huỷ. */
export const POST = route<{ id: string }>(async (_request, params) => {
    const actor = await requireActor("cashier");
    const sessionId = uuid(params.id, "Mã phiên");
    await withTransaction(actor.db, async (client) => {
        const bill = await refreshDraftBill(client, sessionId, actor.account.id);
        await audit(client, auditActor(actor, "cashier"), {
            action: "bill.draft_refreshed",
            entityType: "bill",
            entityId: bill.id,
            sessionId,
            after: { subtotal: bill.subtotal, total: bill.total },
            retention: "financial",
        });
    });
    const receipt = await loadReceipt(actor.db, sessionId);
    return ok({ billId: receipt?.bill.id, status: receipt?.bill.status, total: receipt?.receipt.total, html: receipt?.html, text: receipt?.text });
});
