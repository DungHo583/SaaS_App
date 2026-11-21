import type { Queryable } from "@/lib/db";
import { HttpError, integer, optionalText, text, uuid } from "@/lib/http";

export const BADGES = ["best_seller", "must_try", "recommend", "new"] as const;

export const MENU_ITEM_COLUMNS = `mi.id, mi.category_id, c.name AS category_name, mi.name, mi.description, mi.unit, mi.price,
    mi.image_url, mi.highlight_badge, mi.is_available, mi.manual_portions, mi.sold_out_at, mi.sort_order`;

export async function listMenuAdmin(db: Queryable) {
    const [items, categories] = await Promise.all([
        db.query(
            `SELECT ${MENU_ITEM_COLUMNS} FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id
             WHERE mi.deleted_at IS NULL ORDER BY c.sort_order, mi.sort_order, mi.created_at`,
        ),
        db.query("SELECT id, name, sort_order, is_active FROM menu_categories WHERE deleted_at IS NULL ORDER BY sort_order, created_at"),
    ]);
    return { items: items.rows, categories: categories.rows };
}

export async function getMenuItem(db: Queryable, id: string) {
    const result = await db.query(
        `SELECT ${MENU_ITEM_COLUMNS} FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id WHERE mi.id = $1`,
        [id],
    );
    return result.rows[0];
}

/** Đọc + kiểm tra form món (giá tính bằng đồng). */
export function parseMenuItem(body: Record<string, unknown>) {
    const imageUrl = optionalText(body.imageUrl, { max: 3_000_000, label: "Ảnh" });
    if (imageUrl && !/^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/.test(imageUrl)) {
        throw new HttpError(400, "Ảnh phải là đường dẫn https hoặc file ảnh PNG/JPEG/WebP/GIF.");
    }
    const badge = body.highlightBadge ? String(body.highlightBadge) : null;
    if (badge && !(BADGES as readonly string[]).includes(badge)) throw new HttpError(400, "Nhãn món không hợp lệ.");
    const portions = body.manualPortions === null || body.manualPortions === "" || body.manualPortions === undefined
        ? null : integer(body.manualPortions, { min: 0, max: 100_000, label: "Số phần còn bán" });
    return {
        categoryId: uuid(body.categoryId, "Danh mục"),
        name: text(body.name, { max: 150, required: true, label: "Tên món" }),
        description: text(body.description, { max: 500, label: "Mô tả" }),
        unit: text(body.unit ?? "phần", { max: 20, required: true, label: "Đơn vị tính" }),
        price: integer(body.price, { min: 0, max: 100_000_000, label: "Giá" }),
        imageUrl,
        highlightBadge: badge,
        isAvailable: body.isAvailable !== false,
        manualPortions: portions,
        sortOrder: body.sortOrder === undefined ? 0 : integer(body.sortOrder, { min: 0, max: 10_000, label: "Thứ tự" }),
    };
}

/** Thực đơn đang bán (trang khách + màn gọi món của nhân viên), kèm số phần còn lại nếu có giới hạn. */
export async function listSellableMenu(db: Queryable, inventoryEnabled: boolean) {
    const [items, categories] = await Promise.all([
        db.query(
            `SELECT mi.id, mi.name, mi.description, mi.unit, mi.price, mi.image_url, mi.highlight_badge,
                    c.name AS category, (mi.sold_out_at IS NOT NULL) AS sold_out,
                    CASE WHEN $1 THEN p.max_portions ELSE mi.manual_portions END AS remaining
             FROM menu_items mi
             JOIN menu_categories c ON c.id = mi.category_id
             LEFT JOIN menu_item_portions p ON p.menu_item_id = mi.id
             WHERE mi.deleted_at IS NULL AND mi.is_available AND c.deleted_at IS NULL AND c.is_active
             ORDER BY c.sort_order, mi.sort_order, mi.created_at`,
            [inventoryEnabled],
        ),
        db.query(
            `SELECT c.name FROM menu_categories c
             WHERE c.deleted_at IS NULL AND c.is_active
               AND EXISTS (SELECT 1 FROM menu_items mi WHERE mi.category_id = c.id AND mi.deleted_at IS NULL AND mi.is_available)
             ORDER BY c.sort_order, c.created_at`,
        ),
    ]);
    return {
        dishes: items.rows.map((row) => ({ ...row, sold_out: row.sold_out || row.remaining === 0 })),
        categories: categories.rows.map((row) => row.name as string),
    };
}
