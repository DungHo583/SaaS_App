# Kế hoạch phát triển

## Ưu tiên cao

1. Hoàn thiện API và schema cho thực đơn, danh mục và tồn kho.
2. Kết nối giỏ hàng khách hàng với PostgreSQL.
3. Tạo đơn theo bàn và chặn duplicate submission.
4. Revalidate stock, giá và tổng tiền phía server.
5. Lịch sử và theo dõi đơn theo bàn.

## Ưu tiên trung bình

1. CRUD bàn ăn.
2. CRUD nhân viên và phân quyền.
3. Quản lý trạng thái món theo từng công đoạn.
4. Hoá đơn và lịch sử thanh toán.
5. Tìm kiếm và lọc đơn trong dashboard.

## Tính năng realtime

- Cập nhật đơn từ bếp đến khách hàng.
- Cập nhật trạng thái bàn.
- Cập nhật số lượng tồn kho.
- Reconcile khi reconnect bằng HTTP fetch fallback.

## Bảo mật

- Password hash bằng thuật toán thích hợp thay cho demo salt hiện tại.
- Session rotation và expiration policy.
- CSRF protection cho mutation API.
- Rate limit cho login.
- Audit log cho thay đổi quản trị.
- Phân quyền role-based.

## Kiểm thử

- Unit test cho auth và state giỏ hàng.
- Integration test cho API đơn và thanh toán.
- E2E cho luồng khách hàng và quản trị.
- Test database migration.

## Chất lượng giao diện

- Kiểm tra 320px, 375px, 768px và desktop.
- Keyboard navigation.
- Screen reader labels.
- Focus trap và Escape cho dialog/drawer.
- Loading, empty và error state rõ ràng.
