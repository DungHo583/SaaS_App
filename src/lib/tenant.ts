import { headers } from "next/headers";
import { platformDb, tenantPool } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type Tenant = { id: string; slug: string; displayName: string; dbName: string };

const CACHE_MS = 30_000;
const cache = new Map<string, { tenant: Tenant | null; status: string | null; at: number }>();

/**
 * Slug quán từ Host: <slug>.<APP_BASE_DOMAIN>. Mặc định APP_BASE_DOMAIN = "localhost",
 * nên trong development mở http://demo.localhost:3000.
 */
export function slugFromHost(host: string): string | null {
    const hostname = host.split(":")[0].toLowerCase();
    const base = (process.env.APP_BASE_DOMAIN ?? "localhost").toLowerCase();
    if (!hostname.endsWith(`.${base}`)) return null;
    const sub = hostname.slice(0, -(base.length + 1));
    return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(sub) ? sub : null;
}

/** Quán của request hiện tại. Development: không có subdomain thì dùng DEV_TENANT_SLUG (mặc định "demo"). */
export async function getTenant(): Promise<Tenant> {
    const host = (await headers()).get("host") ?? "";
    let slug = slugFromHost(host);
    if (!slug && process.env.NODE_ENV !== "production") slug = process.env.DEV_TENANT_SLUG ?? "demo";
    if (!slug) throw new HttpError(404, "Không xác định được quán từ địa chỉ truy cập.");

    let entry = cache.get(slug);
    if (!entry || Date.now() - entry.at > CACHE_MS) {
        const result = await platformDb().query(
            "SELECT id, slug, display_name, db_name, status FROM tenants WHERE slug = $1",
            [slug],
        );
        const row = result.rows[0];
        entry = {
            tenant: row ? { id: row.id, slug: row.slug, displayName: row.display_name, dbName: row.db_name } : null,
            status: row?.status ?? null,
            at: Date.now(),
        };
        cache.set(slug, entry);
    }
    if (!entry.tenant) throw new HttpError(404, "Không tìm thấy quán.");
    if (entry.status !== "active") throw new HttpError(403, "Quán đang tạm ngưng dịch vụ.");
    return entry.tenant;
}

export async function getTenantDb() {
    const tenant = await getTenant();
    return { tenant, db: tenantPool(tenant.dbName) };
}
