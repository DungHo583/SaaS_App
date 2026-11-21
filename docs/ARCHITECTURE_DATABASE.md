# Kiến trúc ứng dụng

Cập nhật lần cuối: 22/11/2026. Schema database chi tiết: [DATABASE_DESIGN.md](DATABASE_DESIGN.md). Quy trình nghiệp vụ: [BUSINESS_PROCESS.md](BUSINESS_PROCESS.md).

> Schema cũ (`saas_app`, `sql/init.sql`, `admin_users`/`staff_users`, JWT) đã được **xoá** ngày 22/11/2026.

## Công nghệ

- Next.js 16 App Router (`cacheComponents` bật), React 19, TypeScript, Tailwind CSS 4
- PostgreSQL 16 (`pg`), Docker Compose
- FontAwesome (`@fortawesome/react-fontawesome` + `free-solid-svg-icons`)
- `qrcode` (QR bàn, VietQR), `nodemailer` (OTP, cảnh báo, phiếu qua email)

## Luồng một request

```text
Host: <slug>.<APP_BASE_DOMAIN>
  -> src/lib/tenant.ts      tra slug trong saas_platform.tenants (cache 30s); quán không active → 403/404
  -> src/lib/db.ts          pool kết nối tới tenant_<slug>
  -> src/lib/auth.ts        cookie bn_shift → shifts + accounts; kiểm tra PIN (pin_verified_at), quyền (permissions.ts)
  -> route handler          kiểm tra input (http.ts) → nghiệp vụ (ops.ts) trong transaction → audit_log (audit.ts)
  -> lỗi                    HttpError / trigger DB → JSON {error, code} tiếng Việt
```

Mã trạng thái dùng chung: `401` cần đăng nhập · `428` cần đổi mật khẩu và đặt PIN · `423` cần nhập PIN · `403` không có quyền / cần OTP (`code: otp_required`) · `409` vi phạm luật nghiệp vụ.

## Cấu trúc thư mục

```text
db/migrations/{platform,tenant}/NNNN_*.sql   Schema (chạy bằng scripts/migrate.mjs)
db/tests/tenant-rules.test.mjs               53 test luật DB
tests/e2e-flow.test.mjs                      58 bước E2E qua HTTP
scripts/migrate.mjs, create-tenant.mjs       Migration runner, đăng ký quán
src/lib/
  tenant.ts db.ts http.ts                    Chọn quán, kết nối, tiện ích route/lỗi
  auth.ts password.ts permissions.ts         Ca đăng nhập, PIN, hash, ma trận quyền
  otp.ts audit.ts settings.ts                OTP email, ghi log, cấu hình quán
  ops.ts sessions.ts guest.ts                Nghiệp vụ gọi món/bếp/phiếu, chi tiết phiên, khách QR
  menu.ts tables.ts accounts.ts              Truy vấn dùng chung
  receipt/ vietqr.ts mailer.ts format.ts     Phiếu 80mm, VietQR, email, định dạng
  page-auth.ts                               Bảo vệ trang server-side
src/components/
  ui/            Dialog, CodeInput (PIN/OTP), PinGate (khoá màn hình), api client, styles
  admin/         AdminShell, MenuManager, TablesManager, StaffManager, SettingsManager, AuditViewer, OtpPrompt
  staff/         StaffBoard, SessionPanel, MenuPicker, CashierPanel, KitchenBoard, PinConfirm
  AppHeader, CategoryNav, MenuList, AdminDashboardClient   (giao diện khách / dashboard)
```

## Trang

| Trang | Ai dùng | Ghi chú |
|---|---|---|
| `/?t=<qr_token>` | Khách | Thực đơn, giỏ, gửi lượt gọi (chờ nhân viên xác nhận), nhãn "món đã gọi" |
| `/orders?t=` | Khách | Lịch sử + trạng thái từng món (cập nhật 10s) |
| `/orders/bill?t=` | Khách | Phiếu tạm tính / phiếu thanh toán 80mm |
| `/admin/login` | Mọi tài khoản | Đăng nhập; lần đầu: đổi mật khẩu + đặt PIN |
| `/admin/dashboard` | Owner | Doanh thu hôm nay, yêu cầu chờ duyệt, trạng thái bàn |
| `/admin/menu` | Owner | Món (đơn vị tính, số phần còn bán, ảnh, nhãn), danh mục |
| `/admin/tables` | Owner | Bàn, in QR, sinh lại QR |
| `/admin/staff` | Owner | Tài khoản, vai trò, mật khẩu tạm, thiết bị |
| `/admin/settings` | Owner | Thông tin quán/người bán, tài khoản ngân hàng (OTP), config, hồ sơ owner |
| `/admin/audit` | Owner | Log (OTP), 2 loại quán/khách, kiểm tra chuỗi băm |
| `/staff` | Owner, quản lý, nhân viên | Danh sách bàn, lượt chờ xác nhận, chọn vai trò → gọi món / chạy bàn / thu ngân |
| `/staff/kitchen` | Bếp (owner/quản lý khi bất khả kháng) | Hàng đợi bếp, hết món |

## API

| Nhóm | Route | Quyền |
|---|---|---|
| Xác thực | `POST /api/auth/{login,first-login,pin,lock,logout}`, `GET /api/auth/me` | — |
| Khách | `GET /api/public/menu`, `GET /api/public/tables/[token]`, `POST .../rounds`, `GET .../bill` | Không đăng nhập (cookie ẩn danh `bn_guest`) |
| Vận hành | `GET /api/staff/board`, `POST /api/staff/sessions`, `GET /api/staff/sessions/[id]`, `POST .../rounds`, `.../transfer`, `.../merge`, `.../abnormal`, `GET/POST .../bill`, `DELETE .../devices/[deviceId]` | order / cashier |
| Vận hành | `POST /api/staff/rounds/[id]` (xác nhận/khôi phục/từ chối), `POST /api/staff/items/[id]` (start/ready/serve/cancel/sold_out) | order / runner / kitchen theo thao tác |
| Thu ngân | `POST /api/staff/bills/[id]/{payments,issue,email}`, `POST /api/staff/payments/[id]` | cashier (+ PIN) |
| Bếp | `GET /api/staff/kitchen`, `POST /api/staff/menu/[id]/sold-out` | kitchen |
| Quản trị | `/api/admin/{settings,profile,otp,otp/verify,accounts,accounts/[id],accounts/[id]/reset-password,devices/[id],menu,menu/[id],menu/categories,menu/categories/[id],tables,tables/[id],tables/[id]/rotate-qr,approvals/[id],audit}` | owner |

## Lệnh database

```bash
npm run db:up                 # PostgreSQL
npm run db:migrate:platform   # saas_platform
npm run tenant:create -- <slug> "<Tên quán>" <owner_username> "<Họ tên>" [email] [--demo]
npm run db:migrate:tenants    # migrate mọi quán
npm run db:test               # test luật DB
```
