import fs from "node:fs/promises";
import { scryptSync } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://saas_app:saas_app_dev@localhost:5432/saas_app" });

const sql = await fs.readFile(new URL("../sql/init.sql", import.meta.url), "utf8");
const passwordHash = scryptSync("Admin@123", "saas-app-salt-v1", 64).toString("hex");

await pool.query(sql);
await pool.query(`
  INSERT INTO admin_users (email, password_hash, name)
  VALUES ('admin@bepnha.vn', $1, 'Quản trị viên')
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
`, [passwordHash]);

await pool.query(`
  INSERT INTO staff_roles (name, display_name, permissions)
  VALUES
    ('admin', 'Quản trị', ARRAY['*']),
    ('manager', 'Quản lý', ARRAY['tables:manage','staff:manage','orders:manage','menu:manage']),
    ('waiter', 'Nhân viên phục vụ', ARRAY['tables:view','orders:manage']),
    ('cashier', 'Thu ngân', ARRAY['orders:view','bills:manage','payments:manage'])
  ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    permissions = EXCLUDED.permissions
`);

await pool.query(`
  INSERT INTO restaurant_tables (id, name, area, capacity, status)
  VALUES
    (11, 'Bàn 11', 'Tầng 1', 4, 'available'),
    (12, 'Bàn 12', 'Tầng 1', 4, 'available'),
    (13, 'Bàn 13', 'Tầng 1', 4, 'available')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    area = EXCLUDED.area,
    capacity = EXCLUDED.capacity,
    status = EXCLUDED.status
`);

await pool.query(`
  INSERT INTO menu_categories (name, sort_order)
  VALUES ('Món chính', 1), ('Khai vị', 2), ('Tráng miệng', 3), ('Đồ uống', 4)
  ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order
`);

await pool.query(`
  INSERT INTO menu_items (category_id, name, description, price, icon, tag, stock, is_available, sort_order)
  SELECT c.id, seeds.name, seeds.description, seeds.price, seeds.icon, seeds.tag, 999, TRUE, seeds.sort_order
  FROM (VALUES
    ('Món chính', 'Cơm gà Hội An', 'Gà xé, cơm đậu xanh, rau sống', 89000, '🍛', 'Bán chạy', 1),
    ('Món chính', 'Bò lúc lắc', 'Bò mềm, khoai tây, sốt tiêu đen', 129000, '🥩', 'Chef chọn', 2),
    ('Khai vị', 'Gỏi cuốn tôm thịt', 'Tôm, thịt heo, bún, rau thơm', 59000, '🥢', 'Mới', 1),
    ('Tráng miệng', 'Chè sen long nhãn', 'Sen tươi, long nhãn, nước cốt dừa', 45000, '🥥', '', 1),
    ('Đồ uống', 'Nước chanh sả', 'Chanh tươi, sả, đường mía', 39000, '🍋', '', 1),
    ('Đồ uống', 'Cà phê muối', 'Cà phê phin, kem muối béo nhẹ', 49000, '☕', 'Hot', 2)
  ) AS seeds(category_name, name, description, price, icon, tag, sort_order)
  JOIN menu_categories c ON c.name = seeds.category_name
  WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.name = seeds.name)
`);

await pool.end();
console.log("Database initialized. Login: admin@bepnha.vn / Admin@123");
