/**
 * Đăng ký 1 quán mới: tạo database riêng, chạy migration, tạo cấu hình quán và tài khoản owner.
 *
 *   node --env-file=.env.local scripts/create-tenant.mjs <slug> "<Tên quán>" <owner_username> "<Họ tên owner>" [owner_email] [--demo]
 *
 * --demo: thêm dữ liệu mẫu (danh mục, món, bàn) cho môi trường development.
 * Mật khẩu tạm của owner chỉ in ra MỘT lần; owner bắt buộc đổi mật khẩu và đặt PIN khi đăng nhập lần đầu.
 */
import pg from "pg";
import { ensureDatabase, migrate, platformUrl, tenantUrl } from "./migrate.mjs";
import { generateTemporaryPassword, hashSecret } from "./lib/password.mjs";

const args = process.argv.slice(2);
const demo = args.includes("--demo");
const [slug, displayName, ownerUsername, ownerName, ownerEmail] = args.filter((arg) => !arg.startsWith("--"));

if (!slug || !displayName || !ownerUsername || !ownerName) {
    console.error('Cách dùng: create-tenant.mjs <slug> "<Tên quán>" <owner_username> "<Họ tên owner>" [owner_email] [--demo]');
    process.exit(2);
}

const dbName = `tenant_${slug.replace(/-/g, "_")}`;

async function seedDemo(client, ownerId) {
    const categories = ["Món chính", "Khai vị", "Tráng miệng", "Đồ uống"];
    const categoryIds = {};
    for (const [index, name] of categories.entries()) {
        const result = await client.query(
            "INSERT INTO menu_categories (name, sort_order) VALUES ($1, $2) RETURNING id",
            [name, index + 1],
        );
        categoryIds[name] = result.rows[0].id;
    }
    const items = [
        ["Món chính", "Cơm gà Hội An", "Gà xé, cơm đậu xanh, rau sống", 89000, "best_seller"],
        ["Món chính", "Bò lúc lắc", "Bò mềm, khoai tây, sốt tiêu đen", 129000, "must_try"],
        ["Khai vị", "Gỏi cuốn tôm thịt", "Tôm, thịt heo, bún, rau thơm", 59000, "new"],
        ["Tráng miệng", "Chè sen long nhãn", "Sen tươi, long nhãn, nước cốt dừa", 45000, null],
        ["Đồ uống", "Nước chanh sả", "Chanh tươi, sả, đường mía", 39000, null],
        ["Đồ uống", "Cà phê muối", "Cà phê phin, kem muối béo nhẹ", 49000, "recommend"],
    ];
    for (const [index, [category, name, description, price, badge]] of items.entries()) {
        await client.query(
            `INSERT INTO menu_items (category_id, name, description, price, highlight_badge, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [categoryIds[category], name, description, price, badge, index + 1],
        );
    }
    for (let number = 1; number <= 6; number++) {
        await client.query(
            "INSERT INTO dining_tables (name, area, capacity, sort_order) VALUES ($1, $2, $3, $4)",
            [`Bàn ${number}`, number <= 4 ? "Tầng 1" : "Tầng 2", 4, number],
        );
    }
    await client.query(
        `INSERT INTO audit_log (category, actor_type, actor_label, action, reason, after_data)
         VALUES ('shop', 'system', 'system', 'tenant.demo_seeded', 'Dữ liệu mẫu development', $1)`,
        [JSON.stringify({ created_for_owner: ownerId, categories: categories.length, items: items.length, tables: 6 })],
    );
}

async function main() {
    const platform = new pg.Client({ connectionString: platformUrl() });
    await platform.connect();
    let tenantId;
    try {
        const existing = await platform.query("SELECT 1 FROM tenants WHERE slug = $1 OR db_name = $2", [slug, dbName]);
        if (existing.rowCount > 0) throw new Error(`Quán "${slug}" đã tồn tại.`);
        const inserted = await platform.query(
            "INSERT INTO tenants (slug, display_name, db_name) VALUES ($1, $2, $3) RETURNING id",
            [slug, displayName, dbName],
        );
        tenantId = inserted.rows[0].id;
    } catch (error) {
        await platform.end();
        throw error;
    }

    try {
        await ensureDatabase(tenantUrl(dbName));
        const { version } = await migrate(tenantUrl(dbName), "tenant");

        const temporaryPassword = generateTemporaryPassword();
        const client = new pg.Client({ connectionString: tenantUrl(dbName) });
        await client.connect();
        try {
            await client.query("BEGIN");
            await client.query("INSERT INTO restaurant_settings (display_name) VALUES ($1)", [displayName]);
            const owner = await client.query(
                `INSERT INTO accounts (username, full_name, email, account_type, password_hash, must_change_password)
                 VALUES ($1, $2, $3, 'owner', $4, true) RETURNING id`,
                [ownerUsername, ownerName, ownerEmail ?? null, hashSecret(temporaryPassword)],
            );
            const ownerId = owner.rows[0].id;
            await client.query(
                `INSERT INTO audit_log (category, actor_type, actor_label, action, entity_type, entity_id, after_data)
                 VALUES ('shop', 'system', 'system', 'tenant.created', 'restaurant_settings', '1', $1),
                        ('shop', 'system', 'system', 'account.created', 'account', $2, $3)`,
                [
                    JSON.stringify({ display_name: displayName, slug }),
                    ownerId,
                    JSON.stringify({ username: ownerUsername, account_type: "owner" }),
                ],
            );
            if (demo) await seedDemo(client, ownerId);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            await client.end();
        }

        await platform.query(
            "UPDATE tenants SET status = 'active', activated_at = now(), schema_version = $1 WHERE id = $2",
            [version, tenantId],
        );
        await platform.query(
            "INSERT INTO platform_audit_log (actor_label, action, tenant_id, details) VALUES ('system', 'tenant.created', $1, $2)",
            [tenantId, JSON.stringify({ slug, db_name: dbName, demo })],
        );

        console.log(`Đã tạo quán "${displayName}" (${slug}) — database ${dbName}, schema version ${version}.`);
        console.log(`Owner: ${ownerUsername}`);
        console.log(`Mật khẩu tạm (chỉ hiển thị một lần): ${temporaryPassword}`);
    } catch (error) {
        console.error(`Tạo quán thất bại, tenant vẫn ở trạng thái 'provisioning' (id ${tenantId}).`);
        console.error(`Dọn dẹp thủ công nếu cần: DROP DATABASE ${dbName}; và cập nhật tenants.status = 'cancelled'.`);
        throw error;
    } finally {
        await platform.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
