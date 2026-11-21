import type { PoolClient } from "pg";
import { audit, type AuditActor } from "@/lib/audit";
import type { Queryable } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { RestaurantSettings } from "@/lib/settings";

/**
 * Nghiệp vụ vận hành dùng chung (docs/BUSINESS_PROCESS.md mục 4–6).
 * Luật cứng (trạng thái món, phiên, phiếu) do trigger DB chặn; tầng này kiểm tra những gì DB không biết
 * (món còn bán, số phần, quyền) và giữ kho / số phần nhất quán.
 */

export type CartLine = { menuItemId: string; quantity: number; note: string | null };

export function parseCart(value: unknown): CartLine[] {
    if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, "Chưa chọn món nào.");
    if (value.length > 50) throw new HttpError(400, "Một lượt gọi tối đa 50 dòng món.");
    const merged = new Map<string, CartLine>();
    for (const raw of value) {
        const line = raw as Record<string, unknown>;
        const menuItemId = String(line.menuItemId ?? line.id ?? "");
        const quantity = Number(line.quantity);
        const note = typeof line.note === "string" && line.note.trim() ? line.note.trim().slice(0, 200) : null;
        if (!/^[0-9a-f-]{36}$/i.test(menuItemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
            throw new HttpError(400, "Danh sách món không hợp lệ.");
        }
        const key = `${menuItemId}|${note ?? ""}`;
        const existing = merged.get(key);
        if (existing) existing.quantity += quantity;
        else merged.set(key, { menuItemId, quantity, note });
    }
    return [...merged.values()];
}

/** Lượt gọi chờ xác nhận quá `junk_round_minutes` → order rác (vẫn khôi phục được). */
export async function expireJunkRounds(db: Queryable, settings: RestaurantSettings) {
    await db.query(
        `UPDATE order_rounds SET status = 'junk', junk_at = now()
         WHERE status = 'pending' AND created_at < now() - make_interval(mins => $1)`,
        [settings.junk_round_minutes],
    );
}

type MenuSnapshot = { id: string; name: string; unit: string; price: number };

/** Kiểm tra món còn bán + số phần; trả snapshot tên/đơn vị/giá hiện tại. `lock` = giữ dòng để trừ số phần. */
export async function snapshotMenu(db: Queryable, settings: RestaurantSettings, lines: CartLine[], { lock = false } = {}) {
    const ids = [...new Set(lines.map((line) => line.menuItemId))];
    const result = await db.query(
        `SELECT mi.id, mi.name, mi.unit, mi.price, mi.manual_portions, p.max_portions,
                (mi.is_available AND mi.deleted_at IS NULL AND mi.sold_out_at IS NULL
                 AND c.is_active AND c.deleted_at IS NULL) AS sellable
         FROM menu_items mi
         JOIN menu_categories c ON c.id = mi.category_id
         LEFT JOIN menu_item_portions p ON p.menu_item_id = mi.id
         WHERE mi.id = ANY($1::uuid[])
         ${lock ? "FOR UPDATE OF mi" : ""}`,
        [ids],
    );
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    const totals = new Map<string, number>();
    for (const line of lines) totals.set(line.menuItemId, (totals.get(line.menuItemId) ?? 0) + line.quantity);

    for (const [id, quantity] of totals) {
        const row = byId.get(id);
        if (!row || !row.sellable) throw new HttpError(409, row ? `Món ${row.name} hiện không còn bán.` : "Có món không còn trong thực đơn.");
        if (!settings.inventory_enabled && row.manual_portions !== null && row.manual_portions < quantity) {
            throw new HttpError(409, `Món ${row.name} chỉ còn ${row.manual_portions} phần.`);
        }
        if (settings.inventory_enabled && settings.inventory_blocking && row.max_portions !== null && row.max_portions < quantity) {
            throw new HttpError(409, `Món ${row.name} chỉ còn đủ nguyên liệu cho ${row.max_portions} phần.`);
        }
    }
    return new Map<string, MenuSnapshot>(result.rows.map((row) => [row.id, { id: row.id, name: row.name, unit: row.unit, price: row.price }]));
}

export async function insertItems(db: Queryable, roundId: string, sessionId: string | null, lines: CartLine[], menu: Map<string, MenuSnapshot>) {
    for (const line of lines) {
        const item = menu.get(line.menuItemId) as MenuSnapshot;
        await db.query(
            `INSERT INTO order_items (round_id, session_id, menu_item_id, name, unit, unit_price, quantity, line_total, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [roundId, sessionId, item.id, item.name, item.unit, item.price, line.quantity, item.price * line.quantity, line.note],
        );
    }
}

/** Nguyên liệu (có theo dõi) cần cho `quantity` phần món, đã tính hao hụt. */
async function recipeNeeds(db: Queryable, menuItemId: string, quantity: number) {
    const result = await db.query(
        `SELECT r.ingredient_id, r.quantity * (1 + i.waste_factor) * $2 AS amount
         FROM recipe_lines r JOIN ingredients i ON i.id = r.ingredient_id
         WHERE r.menu_item_id = $1 AND i.is_tracked AND i.deleted_at IS NULL`,
        [menuItemId, quantity],
    );
    return result.rows as Array<{ ingredient_id: string; amount: string }>;
}

type StockEvent = "reserve" | "release" | "consume" | "waste_unconsumed";

/** Giữ kho / số phần theo vòng đời món (DATABASE_DESIGN 5.6, BUSINESS_PROCESS 5.2). */
async function applyStock(db: Queryable, settings: RestaurantSettings, item: { id: string; menu_item_id: string; quantity: number }, event: StockEvent, accountId: string | null) {
    if (!settings.inventory_enabled) {
        if (event === "reserve") {
            await db.query(
                "UPDATE menu_items SET manual_portions = manual_portions - $2 WHERE id = $1 AND manual_portions IS NOT NULL",
                [item.menu_item_id, item.quantity],
            );
        } else if (event === "release") {
            await db.query(
                "UPDATE menu_items SET manual_portions = manual_portions + $2 WHERE id = $1 AND manual_portions IS NOT NULL",
                [item.menu_item_id, item.quantity],
            );
        }
        return;
    }
    for (const need of await recipeNeeds(db, item.menu_item_id, item.quantity)) {
        const amount = Number(need.amount);
        const rows: Array<[string, number]> =
            event === "reserve" ? [["reserve", -amount]]
                : event === "release" ? [["release", amount]]
                    : event === "consume" ? [["release", amount], ["consume", -amount]]
                        : [["release", amount], ["waste", -amount]];
        for (const [type, quantity] of rows) {
            await db.query(
                `INSERT INTO stock_movements (ingredient_id, movement_type, quantity, order_item_id, created_by)
                 VALUES ($1, $2, $3, $4, $5)`,
                [need.ingredient_id, type, quantity, item.id, accountId],
            );
        }
    }
}

/** Mở phiên cho bàn (hoặc phiên mang về/ship khi tableId = null). */
export async function openSession(db: Queryable, accountId: string, tableId: string | null, orderType: "dine_in" | "takeaway" | "delivery" = "dine_in") {
    if (tableId) {
        const table = await db.query("SELECT id FROM dining_tables WHERE id = $1 AND deleted_at IS NULL AND is_active", [tableId]);
        if (table.rowCount === 0) throw new HttpError(404, "Không tìm thấy bàn.");
    }
    const session = await db.query(
        "INSERT INTO table_sessions (order_type, opened_by) VALUES ($1, $2) RETURNING id",
        [tableId ? orderType : orderType === "dine_in" ? "takeaway" : orderType, accountId],
    );
    const sessionId = session.rows[0].id as string;
    if (tableId) {
        await db.query("INSERT INTO session_tables (session_id, table_id, attached_by) VALUES ($1, $2, $3)", [sessionId, tableId, accountId]);
    }
    return sessionId;
}

/** Tên bàn của phiên: bàn đang gắn (phiên mở) hoặc các bàn được tháo lúc đóng phiên. NULL = mang về/ship. */
export async function sessionTableNames(db: Queryable, sessionId: string): Promise<string | null> {
    const result = await db.query(
        `WITH links AS (SELECT * FROM session_tables WHERE session_id = $1),
              current_links AS (SELECT * FROM links WHERE detached_at IS NULL),
              final_links AS (
                  SELECT * FROM links
                  WHERE NOT EXISTS (SELECT 1 FROM current_links)
                    AND detached_at = (SELECT max(detached_at) FROM links))
         SELECT string_agg(t.name, ' + ' ORDER BY x.attached_at) AS names
         FROM (SELECT * FROM current_links UNION ALL SELECT * FROM final_links) x
         JOIN dining_tables t ON t.id = x.table_id`,
        [sessionId],
    );
    return result.rows[0]?.names ?? null;
}

export async function activeSessionForTable(db: Queryable, tableId: string): Promise<string | null> {
    const result = await db.query(
        "SELECT session_id FROM session_tables WHERE table_id = $1 AND detached_at IS NULL",
        [tableId],
    );
    return result.rows[0]?.session_id ?? null;
}

/**
 * Xác nhận (hoặc khôi phục order rác) một lượt gọi: tạo phiên nếu bàn chưa có, cập nhật giá theo menu hiện tại,
 * đưa món vào bếp và giữ kho.
 */
export async function confirmRound(client: PoolClient, settings: RestaurantSettings, roundId: string, accountId: string, actor: AuditActor) {
    const roundResult = await client.query("SELECT * FROM order_rounds WHERE id = $1 FOR UPDATE", [roundId]);
    const round = roundResult.rows[0];
    if (!round) throw new HttpError(404, "Không tìm thấy lượt gọi.");
    if (!["pending", "junk"].includes(round.status)) throw new HttpError(409, "Lượt gọi này đã được xử lý.");

    let sessionId: string | null = round.session_id;
    let opened = false;
    if (!sessionId) {
        sessionId = await activeSessionForTable(client, round.table_id);
        if (!sessionId) {
            sessionId = await openSession(client, accountId, round.table_id);
            opened = true;
        }
    }
    const session = await client.query("SELECT status FROM table_sessions WHERE id = $1", [sessionId]);
    if (session.rows[0]?.status !== "open") throw new HttpError(409, "Phiên của bàn đã đóng.");

    const items = (await client.query(
        "SELECT id, menu_item_id, quantity, note FROM order_items WHERE round_id = $1 AND status = 'pending'",
        [roundId],
    )).rows;
    if (items.length === 0) throw new HttpError(409, "Lượt gọi không còn món nào.");
    const menu = await snapshotMenu(client, settings, items.map((item) => ({ menuItemId: item.menu_item_id, quantity: item.quantity, note: item.note })), { lock: true });

    for (const item of items) {
        const snap = menu.get(item.menu_item_id) as MenuSnapshot;
        await client.query(
            `UPDATE order_items SET name = $2, unit = $3, unit_price = $4, line_total = $4 * quantity, session_id = $5
             WHERE id = $1`,
            [item.id, snap.name, snap.unit, snap.price, sessionId],
        );
        await client.query("UPDATE order_items SET status = 'queued' WHERE id = $1", [item.id]);
        await applyStock(client, settings, item, "reserve", accountId);
    }

    const restoring = round.status === "junk";
    await client.query(
        `UPDATE order_rounds SET status = 'confirmed', session_id = $2, confirmed_at = now(), confirmed_by = $3,
                restored_at = CASE WHEN $4 THEN now() END, restored_by = CASE WHEN $4 THEN $3::uuid END
         WHERE id = $1`,
        [roundId, sessionId, accountId, restoring],
    );
    if (round.customer_device_key_hash) {
        await client.query(
            `INSERT INTO session_devices (session_id, device_key_hash) VALUES ($1, $2)
             ON CONFLICT (session_id, device_key_hash) DO NOTHING`,
            [sessionId, round.customer_device_key_hash],
        );
    }
    if (opened) await audit(client, actor, { action: "session.opened", entityType: "table_session", entityId: sessionId, sessionId, after: { table_id: round.table_id, via_round: roundId } });
    await audit(client, actor, {
        action: restoring ? "round.restored" : "round.confirmed",
        entityType: "order_round",
        entityId: roundId,
        sessionId,
        after: { items: items.length },
    });
    return sessionId;
}

export type ItemAction = "start" | "ready" | "serve" | "cancel" | "sold_out";

/** Chuyển trạng thái 1 món + cập nhật kho. Quyền kiểm tra ở route; luật chuyển trạng thái do trigger DB. */
export async function transitionItem(client: PoolClient, settings: RestaurantSettings, itemId: string, action: ItemAction, accountId: string, reason: string | null) {
    const result = await client.query("SELECT * FROM order_items WHERE id = $1 FOR UPDATE", [itemId]);
    const item = result.rows[0];
    if (!item) throw new HttpError(404, "Không tìm thấy món.");
    const before = item.status as string;

    if (action === "start") {
        await client.query("UPDATE order_items SET status = 'cooking', cooking_by = $2 WHERE id = $1", [itemId, accountId]);
    } else if (action === "ready") {
        await client.query("UPDATE order_items SET status = 'ready', ready_by = $2 WHERE id = $1", [itemId, accountId]);
        await applyStock(client, settings, item, "consume", accountId);
    } else if (action === "serve") {
        await client.query("UPDATE order_items SET status = 'served', served_at = now(), served_by = $2 WHERE id = $1", [itemId, accountId]);
    } else {
        const stage = action === "sold_out" ? "sold_out" : ["cooking", "ready"].includes(before) ? "after_cook" : "before_cook";
        if (stage === "after_cook" && !reason) throw new HttpError(400, "Huỷ món đã nấu phải ghi lý do (tính hao hụt).");
        await client.query(
            `UPDATE order_items SET status = 'cancelled', cancel_stage = $2, cancel_reason = $3, cancelled_at = now(), cancelled_by = $4
             WHERE id = $1`,
            [itemId, stage, reason ?? (stage === "sold_out" ? "Hết món" : null), accountId],
        );
        // Món 'pending' chưa giữ kho (chỉ giữ khi vào bếp) nên không cần trả.
        if (before === "queued") await applyStock(client, settings, item, "release", accountId);
        if (before === "cooking") await applyStock(client, settings, item, "waste_unconsumed", accountId);
        if (action === "sold_out") {
            await client.query(
                "UPDATE menu_items SET sold_out_at = now(), sold_out_by = $2 WHERE id = $1 AND sold_out_at IS NULL",
                [item.menu_item_id, accountId],
            );
        }
    }
    return { item, before };
}

/** Tạo/cập nhật phiếu tạm tính (draft) từ các món chưa huỷ của phiên. */
export async function refreshDraftBill(client: PoolClient, sessionId: string, accountId: string) {
    const session = await client.query("SELECT status FROM table_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    if (!session.rows[0]) throw new HttpError(404, "Không tìm thấy phiên.");
    if (session.rows[0].status !== "open") throw new HttpError(409, "Phiên đã đóng.");

    let bill = (await client.query("SELECT * FROM bills WHERE session_id = $1 AND kind = 'original'", [sessionId])).rows[0];
    if (bill?.status === "issued") return bill;

    const lines = (await client.query(
        `SELECT menu_item_id, name, unit, unit_price, sum(quantity)::int AS quantity, sum(line_total)::int AS line_total
         FROM order_items WHERE session_id = $1 AND status <> 'cancelled'
         GROUP BY menu_item_id, name, unit, unit_price
         ORDER BY min(created_at)`,
        [sessionId],
    )).rows;
    const subtotal = lines.reduce((sum, line) => sum + line.line_total, 0);

    if (!bill) {
        bill = (await client.query(
            "INSERT INTO bills (session_id, created_by, subtotal, total) VALUES ($1, $2, $3, $3) RETURNING *",
            [sessionId, accountId, subtotal],
        )).rows[0];
    } else {
        const paid = await client.query("SELECT 1 FROM payments WHERE bill_id = $1 AND status <> 'cancelled' LIMIT 1", [bill.id]);
        if (paid.rowCount && Number(bill.subtotal) !== subtotal) {
            throw new HttpError(409, "Phiên có món mới sau khi đã ghi nhận thanh toán. Huỷ khoản thanh toán cũ rồi thu lại.");
        }
        await client.query("DELETE FROM bill_lines WHERE bill_id = $1", [bill.id]);
        bill = (await client.query("UPDATE bills SET subtotal = $2, total = $2 - discount WHERE id = $1 RETURNING *", [bill.id, subtotal])).rows[0];
    }
    for (const [index, line] of lines.entries()) {
        await client.query(
            `INSERT INTO bill_lines (bill_id, line_no, name, unit, quantity, unit_price, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [bill.id, index + 1, line.name, line.unit, line.quantity, line.unit_price, line.line_total],
        );
    }
    return bill;
}
