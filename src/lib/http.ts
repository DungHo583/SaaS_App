import { NextResponse, type NextRequest } from "next/server";
import { pgErrorCode } from "@/lib/db";

/** Lỗi có mã HTTP, thông điệp hiển thị được cho người dùng. */
export class HttpError extends Error {
    constructor(public status: number, message: string, public code?: string) {
        super(message);
    }
}

/** Thông điệp tiếng Việt cho các ràng buộc DB (docs/DATABASE_DESIGN.md mục 7). */
const CONSTRAINT_MESSAGES: Record<string, string> = {
    accounts_single_owner: "Mỗi quán chỉ có một tài khoản owner.",
    accounts_single_active_kitchen: "Quán đã có tài khoản bếp đang hoạt động (mỗi quán 1 tài khoản bếp).",
    accounts_roles_valid: "Vai trò không hợp lệ: bếp đứng riêng; nhân viên giữ 1–2 vai trò trong Gọi món, Chạy bàn, Thu ngân.",
    accounts_username_key: "Username đã được dùng (kể cả tài khoản đã khoá).",
    accounts_username_check: "Username chỉ gồm chữ thường không dấu, số, dấu chấm hoặc gạch dưới (3–32 ký tự).",
    accounts_email_check: "Email không hợp lệ.",
    accounts_full_name_check: "Họ tên không được để trống.",
    session_tables_one_active_per_table: "Bàn này đang có phiên mở.",
    menu_items_name_key: "Tên món đã tồn tại.",
    menu_categories_name_key: "Tên danh mục đã tồn tại.",
    dining_tables_name_key: "Tên bàn đã tồn tại.",
    bills_one_original_per_session: "Phiên này đã có phiếu thanh toán.",
    restaurant_settings_tax_code_check: "MST không hợp lệ (10 số, 10 số-3 số, hoặc 12 số).",
    restaurant_settings_bank_bin_check: "Mã ngân hàng (BIN) phải gồm 6 chữ số.",
    restaurant_settings_bank_account_no_check: "Số tài khoản ngân hàng không hợp lệ.",
    menu_items_price_check: "Giá không được âm.",
    menu_items_manual_portions_check: "Món đã hết số phần còn bán.",
    dining_tables_capacity_check: "Sức chứa phải từ 1 đến 100.",
};

function toResponse(error: unknown) {
    if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const code = pgErrorCode(error);
    // Lỗi của `pg` luôn có trường `constraint` (undefined khi lỗi do trigger RAISE) — chỉ nhận chuỗi thật.
    const constraint = typeof error === "object" && error !== null && "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
    if (constraint && CONSTRAINT_MESSAGES[constraint]) {
        return NextResponse.json({ error: CONSTRAINT_MESSAGES[constraint] }, { status: 409 });
    }
    // Trigger nghiệp vụ trả thông điệp tiếng Việt (RAISE EXCEPTION ... USING ERRCODE).
    if (!constraint && code && ["23514", "23001", "42501", "P0001"].includes(code) && error instanceof Error) {
        return NextResponse.json({ error: error.message }, { status: code === "42501" ? 403 : 409 });
    }
    if (code && code.startsWith("23")) {
        console.error("Constraint violation:", constraint, error);
        return NextResponse.json({ error: "Dữ liệu không hợp lệ hoặc bị trùng." }, { status: 409 });
    }
    console.error("Unhandled API error:", error);
    return NextResponse.json({ error: "Lỗi máy chủ. Vui lòng thử lại." }, { status: 500 });
}

type Handler<P> = (request: NextRequest, params: P) => Promise<Response>;

/** Bọc route handler: đọc params, chuyển HttpError / lỗi DB thành JSON. */
export function route<P = Record<string, never>>(handler: Handler<P>) {
    return async (request: NextRequest, context: { params: Promise<P> }) => {
        try {
            return await handler(request, await context.params);
        } catch (error) {
            return toResponse(error);
        }
    };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
    try {
        const body = await request.json();
        if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
        return body as Record<string, unknown>;
    } catch {
        throw new HttpError(400, "Dữ liệu gửi lên không hợp lệ.");
    }
}

export function text(value: unknown, { max = 500, required = false, label = "Trường" } = {}): string {
    const result = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (required && !result) throw new HttpError(400, `${label} không được để trống.`);
    if (result.length > max) throw new HttpError(400, `${label} quá dài (tối đa ${max} ký tự).`);
    return result;
}

export function optionalText(value: unknown, options: { max?: number; label?: string } = {}): string | null {
    const result = text(value, options);
    return result || null;
}

export function integer(value: unknown, { min = 0, max = 1_000_000_000, label = "Giá trị" } = {}): number {
    const result = Number(value);
    if (!Number.isInteger(result) || result < min || result > max) {
        throw new HttpError(400, `${label} phải là số nguyên từ ${min} đến ${max}.`);
    }
    return result;
}

export function uuid(value: unknown, label = "Mã"): string {
    const result = String(value ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) {
        throw new HttpError(400, `${label} không hợp lệ.`);
    }
    return result;
}

export const ok = (data: unknown = { ok: true }, status = 200) => NextResponse.json(data, { status });
