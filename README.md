# SaaS Nhà hàng - Bếp Nhà

Ứng dụng gọi món và vận hành quán ăn cho hộ kinh doanh nhỏ: khách quét QR gọi món, nhân viên xác nhận, bếp làm, thu ngân thanh toán, owner quản trị. Chạy trên cloud theo mô hình **một app, mỗi quán một database**, truy cập qua subdomain.

Công nghệ: Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS 4, PostgreSQL 16, FontAwesome.

## Tài liệu

- [Tổng quan mục tiêu](docs/PROJECT_OVERVIEW.md)
- [Đặc tả quy trình nghiệp vụ](docs/BUSINESS_PROCESS.md) — nguồn chuẩn cho thiết kế
- [Thiết kế Database](docs/DATABASE_DESIGN.md)
- [Kiến trúc ứng dụng](docs/ARCHITECTURE_DATABASE.md)
- [Trạng thái tính năng](docs/IMPLEMENTATION_STATUS.md)
- [Kế hoạch phát triển](docs/ROADMAP.md)
- [Nhật ký thay đổi](docs/CHANGELOG.md)

## Yêu cầu

- Node.js 22 trở lên, npm.
- Docker Desktop hoặc Docker Engine.

## Cài đặt lần đầu

```bash
npm install
npm run db:up                 # PostgreSQL trong Docker
npm run db:migrate:platform   # tạo database nền tảng saas_platform
npm run tenant:create -- demo "Bếp Nhà" chuquan "Chủ quán" chuquan@example.com --demo
#   → in ra MẬT KHẨU TẠM của owner (chỉ hiện 1 lần)
npm run mail:up               # (tuỳ chọn) Mailpit nhận email dev tại http://localhost:8025
npm run dev
```

Mở (Chrome/Edge/Firefox tự trỏ `*.localhost` về máy của bạn):

| Trang | Địa chỉ |
|---|---|
| Đăng nhập (owner, nhân viên, bếp) | http://demo.localhost:3000/admin/login |
| Quản trị owner | http://demo.localhost:3000/admin/dashboard |
| Vận hành nhân viên | http://demo.localhost:3000/staff |
| Khu vực bếp | http://demo.localhost:3000/staff/kitchen |
| Khách gọi món | QR của bàn trong mục **Bàn ăn** → `http://demo.localhost:3000/?t=<qr_token>` |

Ở development, mở `http://localhost:3000` (không có subdomain) sẽ dùng quán `DEV_TENANT_SLUG` (mặc định `demo`).

Lần đăng nhập đầu: dùng mật khẩu tạm, hệ thống bắt đổi mật khẩu và đặt PIN 6 số. Owner cấp tài khoản cho nhân viên và bếp trong mục **Nhân viên**.

## Biến môi trường (`.env.local`)

| Biến | Mặc định (development) | Ý nghĩa |
|---|---|---|
| `PLATFORM_DATABASE_URL` | `postgresql://saas_app:saas_app_dev@localhost:5432/saas_platform` | Database nền tảng |
| `TENANT_DATABASE_URL_TEMPLATE` | `postgresql://saas_app:saas_app_dev@localhost:5432/{db}` | Database từng quán (`{db}` = `tenant_<slug>`) |
| `APP_BASE_DOMAIN` | `localhost` | Domain gốc: quán = `<slug>.<APP_BASE_DOMAIN>` |
| `DEV_TENANT_SLUG` | `demo` | Quán dùng khi không có subdomain (chỉ development) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | `localhost:1025` (Mailpit) | Gửi OTP, cảnh báo thiết bị mới, phiếu thanh toán. Production bắt buộc có |

`DATABASE_URL` và `SESSION_SECRET` của bản cũ **không còn dùng**.

## Lệnh

```bash
npm run lint                  # ESLint
npm run build                 # build production
npm run db:migrate:tenants    # chạy migration mới cho MỌI quán
npm run db:test               # 53 test luật nghiệp vụ ở tầng DB (trên tenant_demo)
npm run test:e2e -- <file>    # 58 bước E2E qua HTTP (xem tests/e2e-flow.test.mjs)
```

## Bảo mật

- Mật khẩu và PIN hash bằng scrypt với salt ngẫu nhiên; mật khẩu tạm chỉ hiện một lần.
- Ca đăng nhập lưu ở DB (thu hồi được), cookie HTTP-only chỉ gắn với subdomain của quán.
- Mỗi thao tác cần PIN còn hiệu lực; thao tác nhạy cảm phải nhập lại PIN.
- Log audit bất biến có chuỗi băm; xem log và đổi tài khoản ngân hàng cần OTP qua email.
- Production: cấu hình SMTP thật, HTTPS, và đổi mật khẩu Postgres mặc định trong `docker-compose.yml`.
