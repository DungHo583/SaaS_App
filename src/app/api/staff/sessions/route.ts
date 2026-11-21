import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { HttpError, ok, readJson, route, uuid } from "@/lib/http";
import { openSession } from "@/lib/ops";

/** Nhân viên mở bàn (khách không dùng QR) hoặc tạo đơn mang về / ship (không gắn bàn). */
export const POST = route(async (request) => {
    const actor = await requireActor("order");
    const body = await readJson(request);
    const orderType = String(body.orderType ?? "dine_in");
    if (!["dine_in", "takeaway", "delivery"].includes(orderType)) throw new HttpError(400, "Loại đơn không hợp lệ.");
    const tableId = orderType === "dine_in" ? uuid(body.tableId, "Bàn") : null;

    const sessionId = await withTransaction(actor.db, async (client) => {
        const id = await openSession(client, actor.account.id, tableId, orderType as "dine_in");
        await audit(client, auditActor(actor, "order"), { action: "session.opened", entityType: "table_session", entityId: id, sessionId: id, after: { table_id: tableId, order_type: orderType } });
        return id;
    });
    return ok({ sessionId }, 201);
});
