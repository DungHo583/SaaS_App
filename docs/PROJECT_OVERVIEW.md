# Tổng quan dự án SaaS Nhà hàng

## Mục tiêu ban đầu

Xây dựng nền tảng SaaS phục vụ quy trình gọi món tại nhà hàng:

- Khách hàng xem thực đơn, lọc món và quản lý giỏ hàng trên thiết bị di động.
- Khách hàng gọi món theo bàn và theo dõi đơn đang xử lý.
- Nhân viên nhà hàng nhận, xác nhận và cập nhật trạng thái món.
- Quản trị viên theo dõi bàn, đơn hàng, doanh thu và quản lý thực đơn.
- Dữ liệu trạng thái cần nhất quán khi mất kết nối hoặc kết nối lại.
- Giao diện đáp ứng từ màn hình 320px trở lên và hỗ trợ bàn phím, screen reader.

## Đối tượng người dùng

1. Khách hàng
2. Nhân viên phục vụ
3. Quản lý nhà hàng
4. Quản trị viên hệ thống

## Nguyên tắc sản phẩm

- Mobile-first, ưu tiên luồng gọi món nhanh.
- Giữ state giỏ hàng độc lập với đơn đã gọi và tổng hoá đơn.
- Dữ liệu menu và đơn hàng cần được xác thực lại phía server.
- Không cho gửi trùng đơn.
- Giữ lịch sử gọi món để hiển thị và theo dõi trạng thái.
- Sử dụng PostgreSQL làm nguồn dữ liệu chính.
- Giao diện warm orange/brown với font Be Vietnam Pro.

## Phạm vi phát triển theo giai đoạn

### Giai đoạn 1 - Nền tảng khách hàng

- Khởi tạo Next.js App Router, TypeScript và Tailwind CSS.
- Tách header, danh mục và danh sách món thành components.
- Xây dựng giỏ hàng, drawer điều hướng và drawer giỏ hàng.
- Chuẩn hoá card món với hình ảnh lớn hơn 45% khung.

### Giai đoạn 2 - Quản trị

- Đăng nhập quản trị bằng session an toàn.
- Dashboard tổng quan.
- Quản lý trạng thái bàn.
- Thống kê số đơn và doanh thu.

### Giai đoạn 3 - Đơn hàng thời gian thực

- API tạo và cập nhật đơn.
- Realtime theo bàn và theo món.
- Xác nhận stock và giá lúc submit.
- Retry HTTP fallback khi reconnect.

### Giai đoạn 4 - Vận hành hoàn chỉnh

- Quản lý thực đơn, danh mục, giá và tồn kho.
- Phân quyền nhân viên/quản lý/quản trị viên.
- Hoá đơn, thanh toán và lịch sử giao dịch.
- Thông báo cho nhân viên và khách hàng.

## Tài khoản phát triển

Tài khoản quản trị mặc định hiện dùng trong môi trường local:

- Email: `admin@bepnha.vn`
- Mật khẩu: `Admin@123`

Tài khoản này chỉ dùng cho development. Phải đổi hoặc xoá trước production.
