# Thiết kế Database

Cập nhật lần cuối: 22/11/2026. Nguồn nghiệp vụ: [BUSINESS_PROCESS.md](BUSINESS_PROCESS.md). Lịch sử thay đổi: [CHANGELOG.md](CHANGELOG.md).

Schema thực tế nằm trong migration; tài liệu này giải thích **vì sao** schema như vậy. Khi hai nơi lệch nhau thì migration là đúng, và phải sửa lại tài liệu.

| File | Nội dung |
|---|---|
| [db/migrations/platform/0001_init.sql](../db/migrations/platform/0001_init.sql) | Database nền tảng `saas_platform` |
| [db/migrations/tenant/0001_init.sql](../db/migrations/tenant/0001_init.sql) | Database của từng quán `tenant_<slug>` |
| [db/tests/tenant-rules.test.mjs](../db/tests/tenant-rules.test.mjs) | 53 test kiểm chứng các luật mà DB tự chặn |

---

## 1. Trạng thái hiện tại

| Database | Vai trò | Trạng thái |
|---|---|---|
| ~~`saas_app`~~ | Schema cũ cho 1 quán | ❌ **Đã xoá** ngày 22/11/2026 |
| `saas_platform` | Nền tảng: danh sách quán, quản trị nền tảng, OTP, số liệu tổng hợp | ✅ Schema version 0001 |
| `tenant_demo` | Quán mẫu có dữ liệu demo | ✅ Schema version 0002 |

> Toàn bộ API và giao diện đã chạy trên schema này (22/11/2026).

| Migration quán | Nội dung |
|---|---|
| 0001_init | Toàn bộ schema (mục 5) |
| 0002_shift_pin_window | `shifts.pin_verified_at`: cửa sổ PIN trượt — mỗi thao tác cần PIN xác thực trong `idle_logout_seconds` |

## 2. Kiến trúc: một app, mỗi quán một database

```
                    ┌──────────────────────── saas_platform ────────────────────────┐
 quan-a.<domain> ─┐ │ tenants(slug → db_name, status)  platform_admins  OTP  stats  │
 quan-b.<domain> ─┼─► Next.js (1 bản deploy) ──► tra slug trong tenants ──┐          │
 ...              ┘ └──────────────────────────────────────────────────────┼──────────┘
                                                                           ▼
                                       tenant_quan_a   tenant_quan_b   tenant_...
                                       (cùng schema, migrate bằng 1 runner)
```

- Mỗi request đọc subdomain, tra `tenants.slug` để lấy `db_name`, rồi lấy pool kết nối tới DB đó (pool được cache theo quán).
- Quán ở trạng thái `suspended` hoặc `cancelled` sẽ bị từ chối truy cập ngay ở bước tra cứu này.
- Chuỗi kết nối được dựng từ `TENANT_DATABASE_URL_TEMPLATE` (ví dụ `postgresql://user:pass@host:5432/{db}`). DB nền tảng dùng `PLATFORM_DATABASE_URL`.
- **Phiên đăng nhập theo từng quán:** token ngẫu nhiên trong cookie HTTP-only (chỉ gắn với subdomain của quán); database của quán lưu SHA-256 của token trong `shifts`, nên token của quán A không tồn tại ở quán B và owner thu hồi được (khoá tài khoản, thu hồi thiết bị). Không dùng JWT.
- Database của quán **không** chứa `restaurant_id`, vì cả database chỉ thuộc về một quán. Cách ly dữ liệu nằm ở tầng database, không phụ thuộc vào việc code có lọc đúng hay không.

## 3. Quy ước chung

| Quy ước | Lý do |
|---|---|
| Khoá chính `uuid` (`gen_random_uuid()`) | Không đoán được, không trùng khi gộp dữ liệu nhiều quán về nền tảng hoặc chuỗi |
| Không xoá cứng: dùng `deleted_at`, `is_active` hoặc trạng thái. Có trigger `*_no_delete` | Lịch sử đơn và phiếu luôn tham chiếu được tới bản ghi gốc |
| Tiền là `integer` VND | Không có lỗi làm tròn số thực |
| Thời gian là `timestamptz`, hiển thị theo `restaurant_settings.timezone` | Server có thể chạy UTC |
| Snapshot (tên, giá, đơn vị) lưu vào dòng đơn và dòng phiếu | Đổi menu không làm thay đổi đơn hay phiếu cũ |
| Luật nghiệp vụ quan trọng đặt ở **DB** (CHECK, unique index, trigger) | Bug ở API, script tay, hay app mobile sau này đều không vượt qua được |
| Thông báo lỗi trong trigger viết bằng tiếng Việt | API có thể chuyển thẳng cho người dùng khi phù hợp |

## 4. Sơ đồ quan hệ (database quán)

```mermaid
erDiagram
    accounts ||--o{ devices : "đăng nhập trên"
    accounts ||--o{ shifts : "ca"
    devices ||--o{ shifts : ""
    accounts ||--o{ otp_challenges : ""
    menu_categories ||--o{ menu_items : ""
    menu_items ||--o{ recipe_lines : "định lượng"
    ingredients ||--o{ recipe_lines : ""
    ingredients ||--o{ stock_movements : "sổ kho"
    stocktakes ||--o{ stocktake_lines : ""
    dining_tables ||--o{ session_tables : ""
    table_sessions ||--o{ session_tables : "gắn bàn"
    table_sessions ||--o{ session_devices : "máy khách"
    table_sessions ||--o{ order_rounds : "lượt gọi"
    dining_tables ||--o{ order_rounds : "lượt chờ (chưa có phiên)"
    order_rounds ||--o{ order_items : ""
    menu_items ||--o{ order_items : ""
    order_items ||--o{ stock_movements : "giữ chỗ / trừ kho"
    table_sessions ||--o{ bills : "1 phiếu gốc"
    bills ||--o{ bill_lines : ""
    bills ||--o{ payments : ""
    bills ||--o| einvoices : "HĐĐT (sau)"
    bills ||--o{ bills : "điều chỉnh / thay thế"
    table_sessions ||--o| approvals : "đóng bất thường"
    stocktakes ||--o| approvals : "chênh lệch kho"
```

`audit_log` có liên kết (không bắt buộc) tới `accounts`, `devices` và `table_sessions`.

## 5. Các bảng của database quán

### 5.1 Tài khoản và bảo mật

| Bảng | Mục đích | Ràng buộc chính |
|---|---|---|
| `accounts` | Owner, quản lý, nhân viên, bếp | `account_type` ∈ owner/manager/staff/kitchen. `roles` theo luật ghép vai trò (mục 7). Username dạng `[a-z0-9._]`, không dùng lại kể cả khi tài khoản đã bị khoá. Chỉ có 1 owner, 1 tài khoản bếp đang hoạt động, tối đa 2 quản lý. `must_change_password = false` thì bắt buộc đã có `pin_hash` |
| `devices` | Thiết bị đã đăng nhập, theo từng tài khoản. Nhận diện bằng `token_hash` (token ngẫu nhiên lưu trên trình duyệt) | Duy nhất theo `(account_id, token_hash)`. Có các cột duyệt thiết bị và thu hồi thiết bị |
| `shifts` | Ca đăng nhập: bắt đầu bằng mật khẩu, trong ca chỉ cần PIN | `expires_at > started_at`. `end_reason` gồm logout, expired, revoked, password_changed, pin_locked |
| `otp_challenges` | OTP của owner cho việc xem log và đổi tài khoản ngân hàng | Tối đa 10 lần thử. `grant_expires_at` là thời hạn quyền được mở sau khi xác thực (15 phút khi xem log) |

Hash mật khẩu và PIN theo định dạng `scrypt$N$r$p$salt$hash`, **mỗi giá trị một salt ngẫu nhiên** ([scripts/lib/password.mjs](../scripts/lib/password.mjs)). Schema cũ dùng salt cố định, đây là điểm phải bỏ.

### 5.2 Cấu hình quán

| Bảng | Mục đích |
|---|---|
| `restaurant_settings` | **Chỉ một dòng** (`id = 1`). Gồm thông tin hiển thị; người bán (tên hộ kinh doanh, MST 10, 10-3 hoặc 12 số); tài khoản nhận chuyển khoản VietQR (`bank_bin` 6 số, `bank_account_no`); các config `confirm_all_customer_orders` (mặc định **bật**), `junk_round_minutes` (mặc định 10), `idle_logout_seconds` (60), `pin_max_attempts` (5), `shift_max_hours` (14), `require_device_approval`, `inventory_enabled`, `inventory_blocking`, `timezone` |

### 5.3 Menu
| Bảng | Ghi chú |
|---|---|
| `menu_categories` | Tên duy nhất (không phân biệt hoa thường) trong số danh mục chưa xoá |
| `menu_items` | `unit` (đơn vị tính, mặc định "phần"; hoá đơn bắt buộc có). `manual_portions` là số phần nhập tay khi chưa bật kho (NULL = không giới hạn). `sold_out_at/by` là bếp báo hết món, khác với `is_available` là owner tắt món trên menu |

### 5.4 Bàn và phiên bàn
| Bảng | Ghi chú |
|---|---|
| `dining_tables` | `qr_token` ngẫu nhiên 32 ký tự hex. **QR in trên bàn chứa token này, không chứa id hay số bàn**, nên không đoán được QR của bàn khác. Owner sinh lại token khi cần in lại QR |
| `table_sessions` | Phiên ngồi. `order_type` gồm dine_in (mặc định), takeaway, delivery. Máy trạng thái ở mục 6.1. `opened_by` là nhân viên đã xác nhận hoặc mở bàn |
| `session_tables` | Liên kết phiên với bàn. **Unique `(table_id) WHERE detached_at IS NULL`** đảm bảo mỗi bàn chỉ có một phiên đang mở. Khi chuyển bàn: tháo bàn cũ, gắn bàn mới với `reason = transfer`. Khi gộp bàn: gắn bàn của phiên B vào phiên A với `reason = merge`. Mang về và ship không gắn bàn nào |
| `session_devices` | Máy khách đã tham gia phiên (`device_key_hash` ẩn danh). Nhân viên có thể loại máy lạ (`kicked_at/by`) |

### 5.5 Gọi món
| Bảng | Ghi chú |
|---|---|
| `order_rounds` | Lượt gọi, `source` là customer hoặc staff. Lượt đầu của khách khi bàn chưa có phiên: `session_id` NULL, `table_id` có giá trị, trạng thái `pending`. Sau `junk_round_minutes` không được xác nhận thì job chuyển sang `junk`; khôi phục thì chuyển sang `confirmed` kèm `restored_at/by`. `idempotency_key` duy nhất để chống gửi trùng |
| `order_items` | Snapshot `name`, `unit`, `unit_price`, `line_total = unit_price × quantity`. Có các mốc thời gian và người làm cho từng bước: queued, cooking, ready, served, cancelled. `cancel_stage` gồm before_cook, after_cook (bắt buộc lý do, tính hao hụt) và sold_out |

### 5.6 Kho nguyên liệu (module tuỳ chọn)
| Bảng | Ghi chú |
|---|---|
| `ingredients` | `usage_unit` (đơn vị dùng, ví dụ g), `purchase_unit` (đơn vị mua, ví dụ kg), `usage_per_purchase` (ví dụ 1000). `is_tracked = false` dùng cho gia vị, dầu, nước mắm: không tính số phần, không chặn bán. `waste_factor` là hệ số hao hụt (0 đến dưới 1) |
| `recipe_lines` | Định lượng nguyên liệu (theo đơn vị dùng) cho 1 phần món |
| `stock_movements` | **Sổ kho, chỉ cho phép thêm.** Dấu của số lượng ràng buộc theo loại: purchase và release dương; reserve, consume và waste âm; adjust thì cả hai dấu nhưng bắt buộc gắn với một phiếu kiểm kê |
| `stocktakes`, `stocktake_lines` | Phiếu kiểm kê: số trên hệ thống và số đếm thực tế. Chênh lệch cần owner duyệt qua `approvals` |

### 5.7 Phiếu thanh toán và hoá đơn
| Bảng | Ghi chú |
|---|---|
| `bill_sequences` | Bộ đếm số phiếu theo ký hiệu (mặc định `PTT`). Số được cấp **trong cùng transaction phát hành**; nếu rollback thì số không bị mất, nên dãy số liên tục |
| `bills` | `kind` gồm original, adjustment (được phép âm), replacement. `original_bill_id` và `adjustment_reason` bắt buộc với phiếu không phải gốc. Snapshot người bán (tự lấy từ `restaurant_settings` khi phát hành) và người mua. `total = subtotal − discount`. Mỗi phiên chỉ có **1 phiếu gốc** (không tách bill); mỗi phiếu gốc có tối đa 1 phiếu thay thế |
| `bill_lines` | `line_total = quantity × unit_price − discount`. Số lượng âm dùng cho phiếu điều chỉnh |
| `payments` | Một phiếu có thể có nhiều khoản thanh toán (tiền mặt, chuyển khoản). Tiền mặt: `cash_received ≥ amount`, `change_given` được tính tự động. Chuyển khoản: bắt buộc có `transfer_content` (chứa mã phiếu, để đối soát sau này). Khoản thanh toán chỉ đi `pending → confirmed` hoặc `pending → cancelled` (huỷ bắt buộc có lý do) |
| `einvoices` | Hoá đơn điện tử (module sau). 1–1 với phiếu, theo dõi mẫu số, ký hiệu, số, mã cơ quan thuế, mã tra cứu, payload gửi và nhận với nhà cung cấp |

### 5.8 Phê duyệt và log
| Bảng | Ghi chú |
|---|---|
| `approvals` | Loại `abnormal_close` (kèm `session_id` và giá trị thất thoát) hoặc `stocktake_variance`. **Chỉ owner được quyết định** (trigger kiểm tra). Đã quyết định thì không sửa được |
| `audit_log` | Log bất biến có chuỗi băm (mục 8). `category` là shop hoặc customer. `role_context` là vai trò lúc thao tác. `is_elevated` dùng cho trường hợp owner hoặc quản lý làm việc của bếp khi bất khả kháng (✓⚠). `retention` là financial (giữ 10 năm) hoặc general (2 năm) |

## 6. Máy trạng thái (trigger chặn mọi chuyển trạng thái không hợp lệ)

### 6.1 Phiên bàn: `table_sessions_transition`
```
open ──► closed              (bắt buộc có phiếu gốc đã phát hành)
open ──► abnormal_pending    (bắt buộc abnormal_reason) ──► abnormal_closed | abnormal_rejected
open ──► merged              (bắt buộc đã chuyển hết món sang phiên đích)
Rời khỏi 'open' ⇒ tự tháo mọi bàn (session_tables.detached_at) ⇒ bàn trống ngay.
```

### 6.2 Lượt gọi: `order_rounds_transition`
```
pending ──► confirmed | rejected | junk
junk    ──► confirmed (khôi phục, bắt buộc restored_at/by)
confirmed và rejected là trạng thái cuối.
```

### 6.3 Món: `order_items_transition`
```
pending ──► queued ──► cooking ──► ready ──► served
   │           │           │          │
   └───────────┴──► cancelled (before_cook | sold_out)
                           └──────────┴──► cancelled (after_cook, bắt buộc lý do)
Từ khi rời 'pending': không sửa được tên, đơn vị, giá, số lượng, món (muốn đổi thì huỷ và gọi lại).
```

### 6.4 Phiếu: `bills_guard`
```
draft ──► issued   khi đủ các điều kiện:
  · phiếu gốc: không còn món pending/queued/cooking/ready trong phiên
  · tổng các dòng = subtotal
  · phiếu gốc: tổng khoản thanh toán đã xác nhận = total
  · phiếu điều chỉnh/thay thế: phiếu gốc đã phát hành
  → cấp số liên tục, chụp lại thông tin người bán, issued_at
issued: không UPDATE, không DELETE; dòng phiếu không thêm/sửa/xoá; không thêm khoản thanh toán.
```

## 7. Luật nghiệp vụ do database tự chặn

| Luật (BUSINESS_PROCESS) | Cơ chế | Test |
|---|---|---|
| 1 owner / quán (2) | unique `accounts_single_owner` | ✅ |
| Owner không bị khoá, không bị đổi loại; không nâng tài khoản khác thành owner | trigger `accounts_owner_fixed` | ✅ |
| Tối đa 2 quản lý đang hoạt động | trigger `accounts_manager_limit` | ✅ |
| 1 tài khoản bếp chung (Q1) | unique `accounts_single_active_kitchen` | ✅ |
| Bếp đứng riêng; nhân viên 1–2 vai trò trong order, runner, cashier; không trùng (2.1) | CHECK `accounts_roles_valid` | ✅ |
| Đổi mật khẩu lần đầu xong thì phải có PIN (3.1) | CHECK `accounts_pin_after_first_login` | ✅ |
| Username không dấu, duy nhất, không dùng lại | CHECK + unique, không xoá cứng | ✅ |
| Mỗi bàn tối đa 1 phiên mở (4.1) | unique `session_tables_one_active_per_table` | ✅ |
| Phiên chỉ đóng khi đã có phiếu phát hành (4.1) | trigger `table_sessions_transition` | ✅ |
| Đóng phiên bất thường: bắt buộc lý do, bàn trống ngay, chỉ owner duyệt (4.1) | CHECK + trigger + `approvals_owner_only` | ✅ |
| Lượt khách phải có thiết bị; xác nhận thì phải có phiên (4.2) | CHECK trên `order_rounds` | ✅ |
| Order rác khôi phục được; lượt bị từ chối thì không (4.2) | trigger `order_rounds_transition` | ✅ |
| Món đi đúng thứ tự trạng thái, không bỏ qua bếp (4.4) | trigger `order_items_transition` | ✅ |
| Huỷ món đã nấu: bắt buộc lý do, tính hao hụt (4.4) | CHECK + trigger | ✅ |
| Không sửa giá hay số lượng sau khi đã gửi bếp | trigger `order_items_transition` | ✅ |
| Nhãn "món đã gọi" theo phiên, theo số lượng, mất khi đã phục vụ (4.3) | view `session_ordered_badges` | ✅ |
| Không thanh toán khi còn món chưa phục vụ hoặc chưa huỷ (4.1) | trigger `bills_guard` | ✅ |
| Phải thu đủ tiền mới phát hành phiếu | trigger `bills_guard` | ✅ |
| Số phiếu liên tục, không nhảy số (6.2) | `bill_sequences` + trigger | ✅ |
| Phiếu đã phát hành bất biến; sai sót thì lập phiếu điều chỉnh hoặc thay thế (6.2) | trigger `bills_guard`, `bill_lines_guard` | ✅ |
| Không tách bill (Q6) | unique `bills_one_original_per_session` | ✅ |
| Khoản thanh toán đã xác nhận thì không sửa được | trigger `payments_transition` | ✅ |
| Số phần = min(floor((tồn − giữ chỗ) / (định lượng × (1 + hao hụt)))) (5.1) | view `menu_item_portions` | ✅ đúng ví dụ 5/10/2 → 4/8/2 |
| Sổ kho chỉ cho phép thêm; dấu số lượng đúng theo loại | trigger + CHECK | ✅ |
| Log không UPDATE, DELETE, TRUNCATE (8) | trigger `audit_log_immutable`, `audit_log_no_truncate` | ✅ |
| Phát hiện log bị sửa kể cả bởi superuser | chuỗi băm + `audit_verify_chain()` | ✅ |

### Những luật do tầng ứng dụng đảm nhiệm (DB không chặn được)
- Kiểm tra quyền theo ma trận 2.2 cho từng API, cùng với vai trò đã chọn cho thao tác.
- Xác thực PIN, khoá PIN khi sai quá `pin_max_attempts`, tự thoát sau `idle_logout_seconds`.
- Bắt OTP trước khi đổi tài khoản ngân hàng hoặc mở log.
- Job chuyển lượt gọi `pending` sang `junk` sau `junk_round_minutes`. Khi khôi phục thì kiểm tra lại giá và số phần.
- Áp dụng `confirm_all_customer_orders`.
- Ghi `audit_log` cho **mọi** thao tác. DB chỉ đảm bảo log không bị sửa, không tự sinh log.
- Viết số tiền bằng chữ (`total_in_words`): dùng [amount-in-words.ts](../src/lib/receipt/amount-in-words.ts). DB chỉ bắt buộc trường này không được rỗng.
- Đơn `dine_in` phải được gắn bàn trước khi xác nhận lượt gọi đầu tiên.

## 8. Log audit: chuỗi băm

- Mỗi lần ghi log, trigger `audit_log_chain` làm lần lượt:
  1. khoá tuần tự (advisory lock);
  2. cấp `id` tăng dần;
  3. đặt `occurred_at = clock_timestamp()`;
  4. `prev_hash` = `row_hash` của dòng trước;
  5. `row_hash` = SHA-256 của `prev_hash` và toàn bộ nội dung dòng.

  Định dạng dữ liệu đem đi băm là cố định (thời gian quy về UTC dạng ISO), nên không phụ thuộc vào cài đặt `DateStyle` hay `TimeZone` của kết nối.
- `audit_verify_chain()` trả về `id` của dòng đầu tiên bị sai, hoặc NULL nếu toàn bộ chuỗi còn nguyên vẹn.
- **Mỏ neo bên ngoài:** job thống kê ghi `audit_head_id` và `audit_head_hash` của từng quán vào `saas_platform.tenant_daily_stats`. Nếu có người sửa log trong DB của quán rồi tính lại toàn bộ chuỗi, kết quả sẽ không khớp với mỏ neo đã lưu.
- **Dọn log quá hạn** (10 năm với log tài chính, 2 năm với phần còn lại): chỉ job dọn dẹp được xoá, và chỉ khi đã `SET LOCAL app.audit_purge = 'on'` **và** dòng đó đã quá hạn. Sau khi dọn, dòng đầu tiên còn lại được tin theo `prev_hash` của chính nó.
- Ghi log được tuần tự hoá, nên trên một quán nhỏ thì không đáng kể. Giao dịch ghi log nên chạy ở mức READ COMMITTED (mặc định).

## 9. Database nền tảng (`saas_platform`)

| Bảng | Ghi chú |
|---|---|
| `tenants` | `slug` là subdomain (chữ thường, số, `-`; chặn các tên dành riêng như www, admin, api...). `db_name` dạng `tenant_<slug>`. `kind` là independent hoặc chain_member (kèm `chain_id`). `status` gồm provisioning, active, suspended, cancelled. `schema_version` là migration mới nhất đã chạy trên DB của quán. Không xoá cứng |
| `chains` | Chuỗi nhà hàng (giai đoạn sau) |
| `platform_admins` | **Duy nhất 1 tài khoản đang hoạt động** (unique index trên `(true)`). `otp_email` là email nhận OTP |
| `platform_email_changes` | Đổi email nhận OTP. CHECK bắt buộc đúng thứ tự: xác thực email cũ, rồi email mới, rồi mới hoàn tất. Mỗi lúc chỉ có một yêu cầu đổi đang mở |
| `platform_otp_challenges` | OTP cho các mục đích login, change_email_old, change_email_new |
| `platform_recovery_codes` | Mã khôi phục dự phòng (lưu dạng hash) |
| `tenant_daily_stats` | Số liệu theo ngày cho dashboard tổng: số phiên, số phiếu, doanh thu, số lần đóng bất thường, thất thoát, số món huỷ sau khi nấu, mỏ neo log |
| `platform_audit_log` | Log nền tảng, bất biến. **Mỗi lần quản trị nền tảng truy cập một quán còn phải được ghi vào `audit_log` của quán đó**, để owner nhìn thấy |

## 10. Migration và vận hành

```bash
npm run db:migrate:platform                 # tạo saas_platform nếu chưa có + chạy migration
npm run tenant:create -- <slug> "<Tên quán>" <owner_username> "<Họ tên owner>" [email] [--demo]
npm run db:migrate:tenants                  # chạy migration mới cho MỌI quán, cập nhật tenants.schema_version
node --env-file=.env.local scripts/migrate.mjs tenant <db_name>   # một quán
npm run db:test                             # 53 test luật nghiệp vụ trên tenant_demo
```

- Migration là file `NNNN_ten.sql` trong `db/migrations/platform/` hoặc `db/migrations/tenant/`. Mỗi file chạy **một lần**, trong một transaction, và được ghi vào `schema_migrations` kèm checksum.
- **File đã chạy thì không được sửa.** Runner sẽ dừng nếu checksum khác. Muốn thay đổi thì tạo file migration mới.
- Thay đổi schema phải **tương thích ngược ít nhất một phiên bản**, vì mỗi quán được migrate lần lượt, nên trong một lúc sẽ có quán đã lên phiên bản mới và quán chưa lên. Ví dụ: thêm cột mới với giá trị mặc định trước, rồi mới bỏ cột cũ ở một migration sau.
- `tenant:create` lần lượt: thêm `tenants` với trạng thái provisioning, `CREATE DATABASE`, chạy migration, tạo `restaurant_settings`, tạo owner với **mật khẩu tạm ngẫu nhiên in ra đúng một lần**, ghi log, rồi chuyển trạng thái sang active. Nếu lỗi giữa chừng, quán ở lại trạng thái provisioning và script in hướng dẫn dọn dẹp.
- Tài khoản Postgres dùng để chạy `tenant:create` cần quyền `CREATEDB`.

## 11. Đối chiếu: database cũ (`saas_app`) so với đặc tả

| Đặc tả | DB cũ | DB mới |
|---|---|---|
| Mỗi quán một database, có database nền tảng | ❌ Chỉ có một DB | ✅ `saas_platform` + `tenant_*` |
| Khoá UUID, không xoá cứng | ❌ Khoá `SERIAL`, API dùng `DELETE` (cascade) | ✅ |
| Tài khoản: owner, quản lý, nhân viên (1–2 vai trò), bếp | ❌ `admin_users` và `staff_users` tách rời; role lưu dạng permissions text, không có luật ghép | ✅ `accounts` + CHECK |
| Mật khẩu tạm, PIN, thiết bị, ca đăng nhập | ❌ | ✅ |
| Hash mật khẩu dùng salt riêng | ❌ Salt cố định `saas-app-salt-v1` | ✅ Salt riêng cho từng giá trị |
| Config quán, thông tin người bán, tài khoản ngân hàng | ❌ (tạm lấy từ env) | ✅ `restaurant_settings` |
| QR bàn không đoán được | ❌ `?tableId=1` | ✅ `qr_token` |
| Phiên bàn, gộp bàn, chuyển bàn, đóng bất thường | ❌ Chỉ có `restaurant_tables.status` | ✅ |
| Lượt gọi chờ xác nhận, order rác | ❌ Đơn tạo xong là vào bếp ngay | ✅ `order_rounds` |
| Trạng thái từng món, huỷ trước hoặc sau khi nấu | ⚠️ Có cột `status` nhưng không có luật | ✅ Máy trạng thái |
| Đơn vị tính trên món | ❌ | ✅ `unit` |
| Kho nguyên liệu, định lượng, kiểm kê | ❌ Chỉ có `stock` là số phần | ✅ |
| Phiếu số liên tục, bất biến, điều chỉnh hoặc thay thế, người bán và người mua | ❌ `bills` sơ sài, không có số phiếu | ✅ |
| Thanh toán nhiều khoản, VietQR | ❌ | ✅ `payments` |
| Hoá đơn điện tử (chuẩn bị sẵn) | ❌ | ✅ `einvoices` |
| Phê duyệt của owner | ❌ | ✅ `approvals` |
| Log bất biến, chia 2 loại, chuỗi băm, thời hạn lưu | ❌ Không có log | ✅ |
| OTP owner, OTP quản trị nền tảng, đổi email 2 bước | ❌ | ✅ |
| Số liệu tổng về dashboard nền tảng | ❌ | ✅ `tenant_daily_stats` |

## 12. Kế hoạch chuyển app sang schema mới (P0 → P1)

✅ **Đã hoàn thành ngày 22/11/2026** (xem [CHANGELOG.md](CHANGELOG.md)):
1. ✅ Tầng truy cập DB theo subdomain (`src/lib/tenant.ts`, `src/lib/db.ts`); quán không active → 403.
2. ✅ Xác thực: username + mật khẩu → `shifts`; đổi mật khẩu + PIN lần đầu; `devices` + cảnh báo thiết bị mới; `audit()` dùng chung.
3. ✅ Vận hành: menu, bàn, phiên, lượt gọi, bếp, phục vụ; trang khách dùng `qr_token`.
4. ✅ Thanh toán: bills, payments, VietQR; phiếu 80mm đọc từ `bills` + `bill_lines`.
5. ✅ Đã xoá `saas_app`, `sql/init.sql`, `scripts/init-db.mjs`; ARCHITECTURE_DATABASE.md viết lại.
