-- Cửa sổ PIN của ca đăng nhập (BUSINESS_PROCESS 3.2).
-- Mỗi thao tác của nhân viên yêu cầu PIN đã xác thực trong vòng restaurant_settings.idle_logout_seconds;
-- mỗi thao tác hợp lệ gia hạn cửa sổ này (trượt). Khoá màn hình = đặt về NULL.
ALTER TABLE shifts ADD COLUMN pin_verified_at timestamptz;
