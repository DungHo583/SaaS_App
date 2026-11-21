import type { Queryable } from "@/lib/db";

export type RestaurantSettings = {
    display_name: string;
    legal_name: string;
    tax_code: string;
    address: string;
    phone: string;
    email: string;
    logo_url: string | null;
    bank_bin: string | null;
    bank_account_no: string | null;
    bank_account_name: string | null;
    confirm_all_customer_orders: boolean;
    junk_round_minutes: number;
    idle_logout_seconds: number;
    pin_max_attempts: number;
    shift_max_hours: number;
    require_device_approval: boolean;
    inventory_enabled: boolean;
    inventory_blocking: boolean;
    timezone: string;
};

export async function loadSettings(db: Queryable): Promise<RestaurantSettings> {
    const result = await db.query("SELECT * FROM restaurant_settings WHERE id = 1");
    if (!result.rows[0]) throw new Error("Quán chưa có restaurant_settings.");
    return result.rows[0];
}

/** Thông tin công khai cho trang khách (không lộ cấu hình nội bộ). */
export function publicSettings(settings: RestaurantSettings) {
    return {
        displayName: settings.display_name,
        address: settings.address,
        phone: settings.phone,
        logoUrl: settings.logo_url,
    };
}
