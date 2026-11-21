/**
 * Migration runner cho mô hình "1 app, mỗi quán 1 database".
 *
 *   node --env-file=.env.local scripts/migrate.mjs platform          # database nền tảng
 *   node --env-file=.env.local scripts/migrate.mjs tenant <db_name>  # một quán
 *   node --env-file=.env.local scripts/migrate.mjs tenants           # mọi quán đăng ký trong platform
 *
 * Mỗi file db/migrations/<platform|tenant>/NNNN_ten.sql chạy đúng 1 lần, trong 1 transaction.
 * File đã chạy KHÔNG được sửa: runner so checksum và dừng nếu khác.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = new URL("../db/migrations/", import.meta.url);
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export function platformUrl() {
    return process.env.PLATFORM_DATABASE_URL ?? "postgresql://saas_app:saas_app_dev@localhost:5432/saas_platform";
}

export function tenantUrl(dbName) {
    const template = process.env.TENANT_DATABASE_URL_TEMPLATE ?? "postgresql://saas_app:saas_app_dev@localhost:5432/{db}";
    return template.replace("{db}", dbName);
}

/** Tạo database nếu chưa có (kết nối qua database `postgres`). */
export async function ensureDatabase(url) {
    const target = new URL(url);
    const dbName = decodeURIComponent(target.pathname.slice(1));
    const admin = new URL(url);
    admin.pathname = "/postgres";
    const client = new pg.Client({ connectionString: admin.toString() });
    await client.connect();
    try {
        const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
        if (exists.rowCount === 0) {
            await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`);
            return true;
        }
        return false;
    } finally {
        await client.end();
    }
}

async function readMigrations(kind) {
    const dir = new URL(`${kind}/`, MIGRATIONS_DIR);
    const names = (await fs.readdir(dir)).filter((name) => FILE_PATTERN.test(name)).sort();
    return Promise.all(names.map(async (name) => {
        const sql = await fs.readFile(new URL(name, dir), "utf8");
        return {
            version: name.slice(0, 4),
            name,
            sql,
            checksum: createHash("sha256").update(sql).digest("hex"),
        };
    }));
}

/** Chạy các migration chưa áp dụng. Trả về { applied: [...], version }. */
export async function migrate(url, kind) {
    if (!["platform", "tenant"].includes(kind)) throw new Error(`Loại migration không hợp lệ: ${kind}`);
    const migrations = await readMigrations(kind);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        await client.query("SELECT pg_advisory_lock(hashtext('schema_migrations'))");
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    text PRIMARY KEY,
                name       text NOT NULL,
                checksum   text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            )`);
        const done = new Map((await client.query("SELECT version, name, checksum FROM schema_migrations")).rows
            .map((row) => [row.version, row]));

        const applied = [];
        for (const migration of migrations) {
            const existing = done.get(migration.version);
            if (existing) {
                if (existing.checksum !== migration.checksum) {
                    throw new Error(`Migration ${migration.name} đã chạy nhưng nội dung file bị sửa (checksum khác). Tạo migration mới thay vì sửa file cũ.`);
                }
                continue;
            }
            await client.query("BEGIN");
            try {
                await client.query(migration.sql);
                await client.query(
                    "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
                    [migration.version, migration.name, migration.checksum],
                );
                await client.query("COMMIT");
                applied.push(migration.name);
            } catch (error) {
                await client.query("ROLLBACK");
                throw new Error(`Migration ${migration.name} lỗi: ${error.message}`, { cause: error });
            }
        }
        const version = migrations.at(-1)?.version ?? null;
        return { applied, version };
    } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext('schema_migrations'))").catch(() => {});
        await client.end();
    }
}

async function main() {
    const [command, dbName] = process.argv.slice(2);

    if (command === "platform") {
        const url = platformUrl();
        if (await ensureDatabase(url)) console.log("Đã tạo database nền tảng.");
        const result = await migrate(url, "platform");
        console.log(`platform: ${result.applied.length ? result.applied.join(", ") : "không có migration mới"} (version ${result.version})`);
        return;
    }

    if (command === "tenant" && dbName) {
        const result = await migrate(tenantUrl(dbName), "tenant");
        console.log(`${dbName}: ${result.applied.length ? result.applied.join(", ") : "không có migration mới"} (version ${result.version})`);
        return;
    }

    if (command === "tenants") {
        const platform = new pg.Client({ connectionString: platformUrl() });
        await platform.connect();
        try {
            const tenants = (await platform.query(
                "SELECT id, slug, db_name FROM tenants WHERE status <> 'cancelled' ORDER BY created_at",
            )).rows;
            let failed = 0;
            for (const tenant of tenants) {
                try {
                    const result = await migrate(tenantUrl(tenant.db_name), "tenant");
                    await platform.query("UPDATE tenants SET schema_version = $1 WHERE id = $2", [result.version, tenant.id]);
                    console.log(`${tenant.slug}: ${result.applied.length ? result.applied.join(", ") : "đã mới nhất"} (version ${result.version})`);
                } catch (error) {
                    failed++;
                    console.error(`${tenant.slug}: LỖI — ${error.message}`);
                }
            }
            if (failed) process.exitCode = 1;
        } finally {
            await platform.end();
        }
        return;
    }

    console.error("Cách dùng: migrate.mjs platform | tenant <db_name> | tenants");
    process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
