# SaaS Nhà hàng - Bếp Nhà

Ứng dụng đặt món cho khách hàng và hệ thống quản trị nhà hàng, xây dựng bằng Next.js, TypeScript, Tailwind CSS và PostgreSQL.

## Tài liệu

- [Tổng quan mục tiêu](docs/PROJECT_OVERVIEW.md)
- [Trạng thái tính năng](docs/IMPLEMENTATION_STATUS.md)
- [Kiến trúc và Database](docs/ARCHITECTURE_DATABASE.md)
- [Kế hoạch phát triển](docs/ROADMAP.md)

## Tính năng hiện tại

- Thực đơn mobile-first với danh mục và giỏ hàng.
- Navigation drawer và cart drawer.
- Tự điều chỉnh layout giỏ hàng theo kích thước màn hình.
- Login quản trị bằng HTTP-only session cookie.
- Dashboard quản trị với thống kê đơn, doanh thu và bàn.
- PostgreSQL 16 chạy trong Docker.

## Yêu cầu

- Node.js 20 trở lên.
- npm.
- Docker Desktop hoặc Docker Engine.

## Cài đặt

```bash
npm install
npm run db:up
npm run db:init
npm run dev
```

Mở:

- Khách hàng: `http://localhost:3000`
- Đăng nhập quản trị: `http://localhost:3000/admin/login`
- Dashboard: `http://localhost:3000/admin/dashboard`

Tài khoản development:

- Email: `admin@bepnha.vn`
- Mật khẩu: `Admin@123`

## PostgreSQL

Docker Compose tạo database:

- Database: `saas_app`
- User: `saas_app`
- Password: `saas_app_dev`
- Port: `5432`

Các lệnh:

```bash
npm run db:up
npm run db:init
npm run db:reset
```

`db:reset` sẽ xoá volume database hiện tại. Chỉ dùng cho development.

## Lệnh kiểm tra

```bash
npm run lint
npm run build
npm run start
```

## Cấu trúc chính

```text
src/app                 Route và API Next.js
src/components         Components UI và dashboard
src/data               Dữ liệu menu
src/lib                Database và authentication
src/types              TypeScript types
sql/init.sql           Schema PostgreSQL
scripts/init-db.mjs    Khởi tạo dữ liệu development
docs                   Tài liệu mục tiêu và roadmap
```

## Bảo mật

- Không sử dụng tài khoản development ở production.
- Thay `SESSION_SECRET` bằng giá trị bí mật mạnh.
- Thay cơ chế password hash demo trước khi phát hành.
- Khuyến nghị bổ sung CSRF, rate limiting, role-based access và audit log.
