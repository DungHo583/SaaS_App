# Trạng thái tính năng

Cập nhật lần cuối: 21/11/2026

## Đã hoàn thành

### Nền tảng

- [x] Khởi tạo Next.js App Router.
- [x] Cấu hình TypeScript.
- [x] Cấu hình Tailwind CSS.
- [x] Cấu trúc App Router trong `src/app`.
- [x] API mock menu tại `/api/menu`.
- [x] PostgreSQL 16 chạy bằng Docker Compose.
- [x] Script khởi tạo schema và dữ liệu mẫu.

### Trang khách hàng

- [x] Mobile-first layout từ 320px.
- [x] Header với menu thu gọn.
- [x] Header hiển thị giỏ hàng và số lượng món.
- [x] Chữ “Giỏ hàng” tự ẩn trên màn hình rất nhỏ; icon vẫn được giữ.
- [x] Navigation drawer.
- [x] Menu danh mục có active state.
- [x] Card món với tỷ lệ media/nội dung 45/55.
- [x] Nút thêm và điều chỉnh số lượng.
- [x] Nút `+` dùng màu cam thống nhất với nút “Thêm”.
- [x] `cursor: pointer` cho các nút hoạt động.
- [x] Drawer giỏ hàng chiếm khoảng 98% màn hình.
- [x] Danh sách món trong giỏ, tổng tiền và nút gọi món.
- [x] Vô hiệu hoá Lịch sử gọi món, Theo dõi món và Hoá đơn trước đơn đầu tiên.

### Kiến trúc components

- [x] `AppHeader` độc lập.
- [x] `CategoryNav` độc lập.
- [x] `MenuList` độc lập.
- [x] Dữ liệu menu nằm trong `src/data/menu.ts`.
- [x] Type dữ liệu nằm trong `src/types/menu.ts`.

### Quản trị

- [x] Trang đăng nhập `/admin/login`.
- [x] Session cookie HTTP-only bằng JWT.
- [x] API đăng nhập `/api/admin/login`.
- [x] API đăng xuất `/api/admin/logout`.
- [x] Bảo vệ dashboard theo session.
- [x] Trang dashboard `/admin/dashboard`.
- [x] Sidebar điều hướng desktop.
- [x] Navigation mobile.
- [x] Thống kê số đơn, doanh thu và số bàn.
- [x] Hiển thị trạng thái bàn.
- [x] CRUD bàn ăn qua PostgreSQL và API quản trị.
- [x] CRUD nhân viên và phân quyền role seed.
- [x] Quản lý thực đơn, danh mục, giá và tồn kho trong database.
- [x] Gắn khung bàn bằng QR `tableId` trong URL.
- [x] Tạo đơn PostgreSQL với revalidate giá và stock.
- [x] Chống duplicate submit bằng idempotency key.
- [x] Lịch sử gọi món theo bàn.
- [x] Theo dõi trạng thái đơn bằng polling 5 giây.
- [x] Trang hoá đơn cơ bản theo đơn.

## Đang triển khai

- [ ] Tách trang dashboard theo từng module quản trị.
- [ ] Liên kết giỏ hàng khách hàng với đơn PostgreSQL.
- [ ] Realtime bằng WebSocket/SSE.
- [ ] HTTP reconcile sau reconnect.
- [ ] Revalidate stock và giá phía server.
- [ ] Tests unit, integration và E2E.
- [ ] CI/CD và production deployment.

## Chưa thực hiện

- [ ] Xác thực role theo phân quyền.
- [ ] Refresh/rotation session.
- [ ] CSRF protection đầy đủ.
- [ ] Rate limiting đăng nhập.
- [ ] Email reset mật khẩu.
- [ ] Migration framework như Prisma hoặc Drizzle.

## Các route hiện có

| Route               | Mục đích                     | Trạng thái |
| ------------------- | ---------------------------- | ---------- |
| `/`                 | Giao diện gọi món khách hàng | Hoạt động  |
| `/api/menu`         | Dữ liệu menu mock/API        | Hoạt động  |
| `/admin/login`      | Đăng nhập quản trị           | Hoạt động  |
| `/api/admin/login`  | Xác thực quản trị            | Hoạt động  |
| `/api/admin/logout` | Kết thúc session             | Hoạt động  |
| `/admin/dashboard`  | Dashboard quản trị           | Hoạt động  |

## Ghi chú kỹ thuật

- Build production hiện đã xác nhận thành công.
- PostgreSQL đang chạy container `saas_app_postgres`.
- Tài khoản quản trị mặc định là dữ liệu development.
- Session secret trong `.env.local` phải được thay bằng giá trị bí mật mạnh khi deploy.
