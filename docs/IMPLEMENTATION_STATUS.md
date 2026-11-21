# Trạng thái tính năng

Cập nhật lần cuối: 22/11/2026. Chi tiết từng lần sửa xem [CHANGELOG.md](CHANGELOG.md). Đối chiếu với [BUSINESS_PROCESS.md](BUSINESS_PROCESS.md).

## Đã hoàn thành

### Nền tảng (P0)
- [x] Một app, mỗi quán một database; chọn quán theo subdomain (`tenant.ts`).
- [x] Database nền tảng `saas_platform` và database quán `tenant_<slug>`, migration runner có checksum.
- [x] Script đăng ký quán, sinh mật khẩu tạm cho owner.
- [x] Đăng nhập username + mật khẩu → ca đăng nhập lưu ở DB; lần đầu bắt đổi mật khẩu (chính sách mạnh) + đặt PIN 6 số.
- [x] PIN theo cửa sổ `idle_logout_seconds` (server kiểm tra), khoá màn hình khi không thao tác / bấm "Hoàn thành"; sai PIN quá số lần → kết thúc ca.
- [x] Thiết bị: nhận diện bằng token trình duyệt, cảnh báo email khi đăng nhập thiết bị mới, owner duyệt / thu hồi; tuỳ chọn bắt duyệt thiết bị mới.
- [x] Phân quyền theo ma trận 2.2 cho mọi API; owner/quản lý làm việc bếp được đánh dấu "bất khả kháng" trong log.
- [x] Audit log mọi thao tác (2 loại quán/khách), bất biến, chuỗi băm; xem log cần OTP email.

### Quản trị owner
- [x] Dashboard: doanh thu hôm nay, số phiếu, bàn đang phục vụ, huỷ sau nấu / order rác, yêu cầu chờ duyệt.
- [x] Thực đơn: món (đơn vị tính, giá, số phần còn bán, ảnh, nhãn, đang bán), danh mục; xoá mềm.
- [x] Bàn: CRUD, tạm ngưng, in QR (token ngẫu nhiên), sinh lại QR.
- [x] Nhân viên: tài khoản quản lý / nhân viên (1–2 vai trò) / bếp (1 tài khoản), mật khẩu tạm, cấp lại, khoá, thiết bị.
- [x] Cài đặt: thông tin quán & người bán (MST), tài khoản ngân hàng (OTP), config quy trình, hồ sơ owner (đổi mật khẩu/PIN).
- [x] Duyệt / từ chối đóng phiên bất thường (ghi nhận thất thoát).

### Vận hành (P1)
- [x] Khách quét QR → xem thực đơn → gửi lượt gọi **chờ nhân viên xác nhận**; phiên chỉ tạo khi lượt đầu được xác nhận.
- [x] Máy khác quét cùng QR vào thẳng phiên đang mở; nhân viên loại được thiết bị lạ.
- [x] Lượt chờ quá `junk_round_minutes` → order rác, khôi phục được (kiểm tra lại giá/số phần).
- [x] Nhãn "món đã gọi" theo phiên, theo số lượng, mất khi đã phục vụ; gọi trùng chỉ cảnh báo.
- [x] Màn hình nhân viên: danh sách bàn, chọn vai trò (gọi món / chạy bàn / thu ngân), "Hoàn thành" / "Tiếp tục bàn khác", đơn mang về.
- [x] Bếp: chờ bếp → đang làm → xong; huỷ sau nấu bắt buộc lý do; báo hết món / còn món.
- [x] Chuyển bàn (di chuyển phiên), gộp bàn (2 QR cùng 1 phiên).
- [x] Chống gửi trùng bằng idempotency key (khách và nhân viên).

### Thanh toán (P2)
- [x] Phiếu tạm tính từ các món chưa huỷ; phiếu khổ 80mm (48 cột), số tiền bằng chữ.
- [x] Thu tiền mặt (tiền thối) và chuyển khoản VietQR (mô phỏng: QR thật, thu ngân xác nhận thủ công) — bắt buộc PIN.
- [x] Phát hành phiếu (PIN): số liên tục `PTT-0000001`, khoá vĩnh viễn, thông tin người mua; đóng phiên cùng lúc.
- [x] Đóng phiên bất thường (lý do + PIN) → bàn trống ngay → owner duyệt.
- [x] Gửi phiếu qua email, in qua trình duyệt khổ 80mm, khách xem phiếu trên điện thoại.

### Kiểm thử
- [x] 53 test luật DB (`npm run db:test`).
- [x] 58 bước E2E qua HTTP (`npm run test:e2e`).

## Chưa thực hiện

- [ ] Chế độ TẮT `confirm_all_customer_orders` (Q4 — chờ chủ sản phẩm chốt quy trình). Hiện mọi lượt của khách đều chờ xác nhận.
- [ ] Module kho: giao diện nguyên liệu, định lượng, nhập kho, kiểm kê (schema + logic trừ kho đã có).
- [ ] Nhiều nhân viên trên **một** thiết bị dùng chung (chọn tên + PIN); hiện mỗi trình duyệt một ca.
- [ ] Gửi lệnh in tới máy in nhiệt (ESC/POS / Web Bluetooth / in từ cloud).
- [ ] Cổng thanh toán (webhook tự xác nhận chuyển khoản), hoá đơn điện tử, thuế, đơn ship, chuỗi, quảng cáo.
- [ ] Dashboard tổng của quản trị nền tảng, job thu thập `tenant_daily_stats`.
- [ ] Đăng nhập quản trị nền tảng (mật khẩu + OTP email, đổi email 2 bước) — schema đã có.
- [ ] Realtime (hiện polling 5–15 giây), CI/CD, deploy production.

## Ghi chú kỹ thuật

- `npm run build` thành công; `eslint` 0 lỗi (5 warning `window.location.assign` — chủ động tải lại trang khi đăng nhập/đăng xuất).
- Email development cần chạy `npm run mail:up` (Mailpit); nếu không, OTP và gửi phiếu trả lỗi 502 rõ ràng.
- Quán `demo` có owner `chuquan` (mật khẩu tạm in ra khi tạo quán).
