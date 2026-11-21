# Kiến trúc và Database

## Công nghệ

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- PostgreSQL 16
- Docker Compose
- JWT session bằng `jose`
- PostgreSQL client `pg`

## Cấu trúc thư mục chính

```text
src/
  app/
    page.tsx                  # Trang gọi món khách hàng
    api/menu/route.ts         # API menu
    api/admin/login/route.ts  # API đăng nhập
    api/admin/logout/route.ts # API đăng xuất
    admin/login/page.tsx      # Giao diện đăng nhập
    admin/dashboard/page.tsx  # Dashboard server-side
  components/
    AppHeader.tsx
    CategoryNav.tsx
    MenuList.tsx
    AdminDashboardClient.tsx
  data/menu.ts
  lib/auth.ts
  lib/db.ts
  types/menu.ts
sql/init.sql
scripts/init-db.mjs
docker-compose.yml
.env.local
```

## Luồng đăng nhập

```text
Người dùng nhập form
  -> POST /api/admin/login
  -> truy vấn admin_users trong PostgreSQL
  -> kiểm tra password hash
  -> tạo JWT session
  -> lưu cookie HTTP-only
  -> chuyển sang /admin/dashboard
```

## Luồng bảo vệ dashboard

```text
GET /admin/dashboard
  -> đọc cookie session
  -> xác thực JWT
  -> truy vấn dữ liệu PostgreSQL
  -> render dashboard

Nếu không có session hợp lệ:
  -> redirect /admin/login
```

## Schema database hiện tại

### `admin_users`

- `id`: khoá chính.
- `email`: duy nhất, dùng đăng nhập.
- `password_hash`: hash mật khẩu.
- `name`: tên hiển thị.
- `is_active`: trạng thái tài khoản.
- `created_at`: thời điểm tạo.

### `restaurant_tables`

- `id`: khoá chính.
- `name`: tên/mã bàn.
- `capacity`: sức chứa.
- `status`: trạng thái bàn.
- `created_at`: thời điểm tạo.

### `orders`

- `id`: khoá chính.
- `table_id`: liên kết tới bàn.
- `status`: trạng thái đơn.
- `total`: tổng tiền.
- `created_at`: thời điểm tạo.

## Schema tiếp theo cần bổ sung

- `menu_categories`
- `menu_items`
- `menu_item_options`
- `order_items`
- `order_status_history`
- `staff_users`
- `staff_roles`
- `bills`
- `payments`

## Lệnh database

```bash
npm run db:up
npm run db:init
npm run db:reset
```

## Biến môi trường

```env
DATABASE_URL=postgresql://saas_app:saas_app_dev@localhost:5432/saas_app
SESSION_SECRET=<chuoi-bao-mat-dai-va-ngau-nhien>
```

Không commit secret production hoặc `.env.local` vào repository.
