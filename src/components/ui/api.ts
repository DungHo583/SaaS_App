"use client";

export class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
        super(message);
    }
}

/**
 * Gọi API JSON. Xử lý chung:
 * - 423 (cần PIN) → phát sự kiện "bn:pin-required" để PinGate khoá màn hình;
 * - 401 hết phiên → về trang đăng nhập; 428 → bước đăng nhập lần đầu.
 */
export async function api<T = Record<string, unknown>>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(path, {
            method: options.method ?? (options.body === undefined ? "GET" : "POST"),
            headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            credentials: "same-origin",
            cache: "no-store",
        });
    } catch {
        throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra mạng và thử lại.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const code = typeof data.code === "string" ? data.code : undefined;
        if (response.status === 423) window.dispatchEvent(new Event("bn:pin-required"));
        if (response.status === 401 && code === "login_required") window.location.assign("/admin/login");
        if (response.status === 428) window.location.assign("/admin/login?step=first");
        throw new ApiError(response.status, typeof data.error === "string" ? data.error : "Có lỗi xảy ra.", code);
    }
    return data as T;
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Có lỗi xảy ra.";

/** Khoá chống gửi trùng cho mỗi lượt gọi. */
export function newIdempotencyKey() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
