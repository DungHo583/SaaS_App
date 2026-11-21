import { Pool, type PoolClient } from "pg";

/**
 * Kết nối PostgreSQL theo mô hình "1 app, mỗi quán 1 database" (docs/DATABASE_DESIGN.md mục 2).
 * - platformDb(): database nền tảng (danh sách quán, quản trị nền tảng).
 * - tenantPool(dbName): database của một quán; pool được cache theo tên database.
 */
const globalForDb = globalThis as unknown as {
    platformPool?: Pool;
    tenantPools?: Map<string, Pool>;
};

export type Queryable = Pick<PoolClient, "query">;

export function platformDb(): Pool {
    globalForDb.platformPool ??= new Pool({
        connectionString: process.env.PLATFORM_DATABASE_URL ?? "postgresql://saas_app:saas_app_dev@localhost:5432/saas_platform",
        max: 5,
    });
    return globalForDb.platformPool;
}

export function tenantPool(dbName: string): Pool {
    if (!/^tenant_[a-z0-9_]{1,50}$/.test(dbName)) throw new Error(`Tên database quán không hợp lệ: ${dbName}`);
    globalForDb.tenantPools ??= new Map();
    let pool = globalForDb.tenantPools.get(dbName);
    if (!pool) {
        const template = process.env.TENANT_DATABASE_URL_TEMPLATE ?? "postgresql://saas_app:saas_app_dev@localhost:5432/{db}";
        pool = new Pool({ connectionString: template.replace("{db}", dbName), max: 5 });
        globalForDb.tenantPools.set(dbName, pool);
    }
    return pool;
}

/** Chạy `fn` trong một transaction; tự ROLLBACK khi lỗi. */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

/** Mã lỗi PostgreSQL (vd. "23505" unique, "23503" foreign key) từ lỗi của `pg`, hoặc undefined. */
export function pgErrorCode(error: unknown): string | undefined {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
        return error.code;
    }
    return undefined;
}
