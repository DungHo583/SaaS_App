import { guestActor, tableByToken } from "@/lib/guest";
import { HttpError, ok, route } from "@/lib/http";
import { loadReceipt } from "@/lib/receipt/load";
import { getTenantDb } from "@/lib/tenant";

/** Phiếu (tạm tính / đã thanh toán) của phiên gần nhất mà máy khách này đã tham gia tại bàn. */
export const GET = route<{ token: string }>(async (_request, params) => {
    const { db } = await getTenantDb();
    const table = await tableByToken(db, params.token);
    const actor = await guestActor();
    const session = (await db.query(
        `SELECT sd.session_id FROM session_devices sd
         JOIN session_tables st ON st.session_id = sd.session_id AND st.table_id = $2
         WHERE sd.device_key_hash = $1 AND sd.kicked_at IS NULL AND sd.joined_at > now() - interval '12 hours'
         ORDER BY sd.joined_at DESC LIMIT 1`,
        [actor.deviceKeyHash, table.id],
    )).rows[0];
    if (!session) throw new HttpError(404, "Bàn chưa có phiếu thanh toán.");
    const loaded = await loadReceipt(db, session.session_id);
    if (!loaded) throw new HttpError(404, "Nhân viên chưa lập phiếu tạm tính. Vui lòng gọi thanh toán.");
    return ok({ title: loaded.receipt.title, number: loaded.receipt.number, total: loaded.receipt.total, html: loaded.html });
});
