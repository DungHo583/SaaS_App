# Nhật ký thay đổi

Mỗi lần chỉnh sửa tính năng đều được ghi lại ở đây: **yêu cầu**, **sửa gì**, **sửa như thế nào**, và **cách kiểm tra**. Mục mới nhất nằm trên cùng.

---

## 22/11/2026 — Xoá schema cũ, viết lại toàn bộ API và module theo đặc tả, bổ sung giao diện còn thiếu

**Yêu cầu:**
- Drop schema cũ và dừng app đang chạy.
- Giữ lại giao diện; mọi API và module cập nhật theo đặc tả mới; bổ sung các form còn thiếu thông tin.
- Ưu tiên style có sẵn và Tailwind; icon dùng FontAwesome.
- Cài thêm công cụ: ECC, ponytail, modern-web-guidance.

### 1. Hạ tầng và dọn dẹp
- Dev server không còn chạy (không có tiến trình Next.js nào). **`DROP DATABASE saas_app`** (dữ liệu dev: 1 admin, 6 món, 1 đơn). Container Postgres vẫn chạy vì chứa `saas_platform` và `tenant_demo`.
- Xoá `sql/init.sql`, `scripts/init-db.mjs`, `src/data/menu.ts`, `src/lib/orders.ts`, `src/types/order.ts`, `src/lib/receipt/seller.ts`, toàn bộ `src/app/api/*` cũ, `src/app/orders/[id]/*`. Bỏ script `db:init`, `db:reset`. Gỡ `jose` (không còn dùng JWT).
- Thêm package (ghim phiên bản, đã phát hành trên 2 tuần): `@fortawesome/fontawesome-svg-core@7.3.1`, `@fortawesome/free-solid-svg-icons@7.3.1`, `@fortawesome/react-fontawesome@3.5.0`, `qrcode@1.5.4`, `@types/qrcode@1.5.6`. FontAwesome cấu hình trong `layout.tsx` (`autoAddCss = false` và import CSS).
- **modern-web-guidance:** đã đọc mã nguồn trước khi chạy (gói của GoogleChrome; `install` chỉ gọi `npx skills add`). Cài với `DISABLE_TELEMETRY=1` vào `.agents/skills/` (symlink ở `.claude/skills/`). **ECC và ponytail** là lệnh `/plugin` của Claude Code, người dùng phải tự chạy.
- Migration quán **0002_shift_pin_window**: thêm `shifts.pin_verified_at` (cửa sổ PIN trượt, server tự kiểm tra).

### 2. Thư viện server (`src/lib`)
| File | Vai trò |
|---|---|
| `tenant.ts`, `db.ts` | Chọn quán theo subdomain (`<slug>.<APP_BASE_DOMAIN>`; dev không có subdomain thì dùng `DEV_TENANT_SLUG`), cache 30 giây; pool theo quán; `withTransaction` |
| `http.ts` | `route()` bọc handler; `HttpError`; đổi lỗi ràng buộc và lỗi trigger DB thành thông điệp tiếng Việt; hàm kiểm tra input |
| `auth.ts`, `password.ts`, `permissions.ts` | Ca đăng nhập (token trong DB), thiết bị, PIN (`requireActor`, `confirmPin`), scrypt với salt ngẫu nhiên, chính sách mật khẩu và PIN, ma trận quyền 2.2, đánh dấu bất khả kháng |
| `audit.ts`, `otp.ts`, `settings.ts` | Ghi log trong cùng transaction; OTP email (hết hạn 5 phút, cấp quyền 15 phút); cấu hình quán |
| `ops.ts`, `sessions.ts`, `guest.ts` | Giỏ hàng, kiểm tra món còn bán và số phần, giữ chỗ/trừ kho, xác nhận lượt (tự mở phiên), chuyển trạng thái món, phiếu tạm tính, chi tiết phiên, khách theo QR token |
| `vietqr.ts` | Payload VietQR (EMVCo + CRC16), chạy được cả trên trình duyệt |
| `receipt/build.ts`, `receipt/load.ts` | Phiếu 80mm đọc từ `bills` + `bill_lines`; người bán lấy từ `restaurant_settings` (snapshot khi phát hành) |

### 3. API mới (57 route; bảng đầy đủ ở [ARCHITECTURE_DATABASE.md](ARCHITECTURE_DATABASE.md#api))
`/api/auth/*` · `/api/public/*` (khách theo QR token) · `/api/staff/*` (bàn, phiên, lượt gọi, món, bếp, thu ngân, chuyển/gộp bàn, đóng bất thường) · `/api/admin/*` (cài đặt, hồ sơ, OTP, tài khoản, thiết bị, menu, bàn, duyệt, log).

### 4. Giao diện
| Màn hình | Giữ nguyên | Bổ sung theo đặc tả |
|---|---|---|
| Trang khách `/` | Bố cục, card món, giỏ, drawer | Mở bằng `?t=<qr_token>` thay cho `?tableId=`; gửi lượt **chờ nhân viên xác nhận**; nhãn "Món đã gọi ×N"; hết món; banner "Giảm 15%" (khuyến mãi không có thật) thay bằng banner chào khách theo bàn; drawer có thông tin quán và gọi điện |
| `/orders`, `/orders/bill` | Kiểu trang cũ | Gộp lịch sử và theo dõi món theo QR token (cũ dùng `/orders/<id>`, dễ đoán); phiếu 80mm |
| Đăng nhập | Toàn bộ giao diện | Username thay cho email; **bước 2 lần đầu**: mật khẩu mới (hiện chính sách ngay trên form) + PIN 6 số |
| Dashboard, Thực đơn, Bàn, Nhân viên | Card, form, preview | `AdminShell` dùng chung (sidebar + nav mobile, icon FA, khoá PIN). Món: **đơn vị tính**, **số phần còn bán** (thay "Tồn kho"). Bàn: **in QR**, sinh lại QR, tạm ngưng. Nhân viên: **username, loại tài khoản, vai trò 1–2 (bếp tách riêng), mật khẩu tạm hiện 1 lần, cấp lại, thiết bị duyệt/thu hồi**. Dashboard: **yêu cầu chờ duyệt** |
| **Mới:** Cài đặt, Nhật ký | — | Thông tin quán và người bán, tài khoản ngân hàng (OTP), config quy trình, hồ sơ owner; log có OTP, 2 loại log, kiểm tra chuỗi băm |
| **Mới:** `/staff`, `/staff/kitchen` | — | Bắt buộc phải có để quy trình chạy được: danh sách bàn, lượt chờ / order rác, chọn vai trò, gọi món, chạy bàn, thu ngân (tiền mặt, VietQR, người mua, phát hành phiếu, in, email), chuyển/gộp bàn, loại thiết bị, đóng bất thường, "Hoàn thành" / "Tiếp tục bàn khác"; bếp 3 cột, hết món |

Theo **modern-web-guidance**:
- Dialog dùng `<dialog>` + `showModal()` + `closedby="any"`, có fallback light-dismiss cho Safari.
- Chặn cuộn trang nền bằng `overscroll-behavior` trên `dialog:modal` và `::backdrop`.
- PIN và OTP dùng **một ô nhập** `type="text"` + `inputmode="numeric"` (OTP có `autocomplete="one-time-code"`).

### Kiểm tra
- `tsc` OK; `eslint` 0 lỗi (5 warning `window.location.assign`, cố ý dùng để tải lại trang khi đăng nhập/đăng xuất); `npm run build` OK (57 route); `npm run db:test` 53/53.
- **E2E 58/58** (`tests/e2e-flow.test.mjs`), chạy trên quán test riêng `e2etest` với dev server tạm ở cổng 3100 (đã tắt sau khi chạy). Bao gồm:
  - đăng nhập lần đầu; mật khẩu yếu và PIN dễ đoán bị chặn;
  - đổi MST sai trả thông điệp tiếng Việt; đổi tài khoản ngân hàng chưa OTP bị chặn;
  - luật vai trò; tài khoản bếp thứ 2 bị chặn; phân quyền 403;
  - khách gọi → chờ xác nhận; chưa có phiên cho tới khi xác nhận; máy thứ 2 vào thẳng phiên; nhãn "món đã gọi";
  - bếp làm món; phiếu tạm tính; sai PIN; VietQR; huỷ chuyển khoản;
  - tiền mặt có tiền thối; chặn phát hành khi còn món chưa phục vụ; phát hành `PTT-0000001` có người mua; khách xem phiếu;
  - khoá màn hình trả 423 và mở bằng PIN;
  - order rác sau 10 phút và khôi phục; chuyển bàn; đóng bất thường và chỉ owner duyệt;
  - log: xem cần OTP, chuỗi băm toàn vẹn, ghi đúng vai trò khi thao tác.
- **Lỗi tìm ra nhờ E2E:** lỗi của `pg` luôn có trường `constraint` (giá trị `undefined`), làm thông điệp tiếng Việt của trigger bị thay bằng câu chung chung. Sửa trong `http.ts`.
- Mọi trang trả 200; trang cần đăng nhập chuyển về `/admin/login` khi chưa đăng nhập; subdomain lạ trả "Không tìm thấy quán".
- Dọn dẹp: đã xoá database quán test; 2 bản ghi `e2etest-*` trong `tenants` chuyển `cancelled` (bảng tenants không cho xoá).

### Còn tồn đọng
Xem [IMPLEMENTATION_STATUS.md → Chưa thực hiện](IMPLEMENTATION_STATUS.md#chưa-thực-hiện): chế độ TẮT xác nhận mọi lượt (Q4); giao diện kho; nhiều người trên một thiết bị; in nhiệt; cổng thanh toán; HĐĐT; quản trị nền tảng; realtime.

---

## 22/11/2026 — Đối chiếu database với đặc tả, xây schema mới và viết tài liệu thiết kế database

**Yêu cầu:** Kiểm tra database hiện tại có đúng với đặc tả không, bổ sung các phần còn thiếu, và viết tài liệu thiết kế database.

### Kết quả kiểm tra
Database `saas_app` hiện tại lệch đặc tả ở hầu hết các điểm. Bảng đối chiếu đầy đủ nằm ở [DATABASE_DESIGN.md mục 11](DATABASE_DESIGN.md#11-đối-chiếu-database-cũ-saas_app-so-với-đặc-tả). Các điểm lớn:
- Chỉ có một database, không tách theo quán.
- Khoá `SERIAL`, xoá cứng.
- Tài khoản không có luật ghép vai trò, không có PIN hay thiết bị; mật khẩu dùng salt cố định.
- QR bàn dùng `?tableId=1`, dễ đoán.
- Không có phiên bàn, lượt gọi, kho, số phiếu liên tục, thanh toán, phê duyệt, log.

### Cách bổ sung
Sửa thẳng vào `saas_app` sẽ làm hỏng mọi API đang chạy. Vì vậy schema đích được xây **song song** dưới dạng migration có đánh số, chạy trên database mới. `saas_app` giữ nguyên cho tới khi chuyển API ở P0/P1.

| Sửa gì | Như thế nào | File |
|---|---|---|
| Migration runner | Mỗi file `NNNN_ten.sql` chạy 1 lần trong 1 transaction. Bảng `schema_migrations` lưu checksum; file đã chạy mà bị sửa thì runner dừng. Có advisory lock chống 2 runner chạy cùng lúc. Tự tạo database nền tảng nếu chưa có. Lệnh `tenants` migrate mọi quán và cập nhật `schema_version` | `scripts/migrate.mjs` (mới) |
| Database nền tảng | tenants (slug, db_name, kind, status), chains, platform_admins (duy nhất 1 tài khoản active), đổi email OTP 2 bước (CHECK bắt buộc đúng thứ tự cũ → mới → hoàn tất), OTP, mã khôi phục, tenant_daily_stats (có mỏ neo log), platform_audit_log bất biến | `db/migrations/platform/0001_init.sql` (mới) |
| Database quán | 26 bảng và 3 view, theo đúng đặc tả (danh sách ở DATABASE_DESIGN mục 5). Các luật nghiệp vụ quan trọng đặt ở DB bằng CHECK, unique index và trigger (mục 7) | `db/migrations/tenant/0001_init.sql` (mới) |
| Hash mật khẩu và PIN | scrypt, salt ngẫu nhiên riêng cho từng giá trị, định dạng `scrypt$N$r$p$salt$hash`. Sinh mật khẩu tạm 12 ký tự đủ 4 loại ký tự | `scripts/lib/password.mjs` (mới) |
| Tạo quán | `npm run tenant:create -- <slug> "<Tên>" <owner> "<Họ tên>" [email] [--demo]` | `scripts/create-tenant.mjs` (mới) |
| Test | 53 test: mỗi luật được thử cả trường hợp đúng lẫn trường hợp phải bị chặn, chạy trong transaction rồi rollback | `db/tests/tenant-rules.test.mjs` (mới) |
| npm scripts | `db:migrate:platform`, `db:migrate:tenants`, `tenant:create`, `db:test` | `package.json` |
| Tài liệu | Viết mới DATABASE_DESIGN.md. Đánh dấu schema trong ARCHITECTURE_DATABASE.md là schema cũ. Liên kết từ BUSINESS_PROCESS mục 11, IMPLEMENTATION_STATUS và README | `docs/*` |

**Lỗi gặp phải trong quá trình làm và cách sửa:**
- `CASE ... THEN` đặt trong điều kiện `IF ... THEN` của PL/pgSQL gây lỗi cú pháp. Sửa bằng cách tách ra thành biến `keep_for`.
- Lần kiểm tra file SQL bằng `psql -1` thành công nên đã COMMIT schema vào `tenant_demo` mà không ghi `schema_migrations`. Đã xoá `tenant_demo` và `saas_platform` (đều vừa được tạo trong lượt này, chưa có dữ liệu) rồi tạo lại bằng runner.

### Kiểm tra
- `npm run db:migrate:platform` → áp dụng 0001. Chạy lại → "không có migration mới".
- `npm run tenant:create -- demo "Bếp Nhà (demo)" chuquan "Chủ quán Demo" --demo` → tạo `tenant_demo` (6 món, 4 danh mục, 6 bàn, owner `chuquan` với mật khẩu tạm).
- `npm run db:migrate:tenants` → "demo: đã mới nhất (version 0001)".
- `npm run db:test` → **53 đạt, 0 lỗi**. Gồm:
  - luật vai trò; một phiên mở trên mỗi bàn; luật đóng phiên; chỉ owner duyệt;
  - order rác và khôi phục; máy trạng thái món; khoá giá sau khi gửi bếp; nhãn "món đã gọi";
  - không thanh toán khi còn món chưa phục vụ; phải thu đủ tiền; số phiếu 1, 2 liên tục; phiếu bất biến; phiếu điều chỉnh âm;
  - ví dụ định lượng của chủ sản phẩm (5/10/2 → 4/8/2); sổ kho chỉ cho thêm;
  - log không sửa, xoá, truncate được; tắt trigger để sửa log thì `audit_verify_chain()` phát hiện.
- Sau khi chạy test, dữ liệu thật không đổi: 1 tài khoản, 0 phiên, số phiếu kế tiếp vẫn là 1, chuỗi log toàn vẹn.
- `eslint db scripts`: OK.

### Còn tồn đọng
- API và giao diện **vẫn chạy trên `saas_app`**. Chuyển sang schema mới là việc của P0/P1 ([DATABASE_DESIGN mục 12](DATABASE_DESIGN.md#12-kế-hoạch-chuyển-app-sang-schema-mới-p0--p1)).
- Mật khẩu tạm của owner `chuquan` trong `tenant_demo` đã được in ra terminal của lượt chạy này. Đây chỉ là dữ liệu development.

---

## 22/11/2026 — Chốt Q1–Q9, làm phiếu khổ 80mm và gửi phiếu qua email

**Yêu cầu:**
- Cập nhật đặc tả theo các câu trả lời Q1–Q9. Khách dùng web; nhân viên, bếp, owner dùng app mobile ở giai đoạn sau, hiện làm trên web.
- (Q7) Làm bản preview phiếu khổ 80mm đúng chuẩn định dạng, và gửi phiếu qua email.

### 1. Đặc tả ([BUSINESS_PROCESS.md](BUSINESS_PROCESS.md))
- Thêm mô hình nền tảng: khách dùng web, nhân viên dùng web và sau này app mobile, nên API phải dùng chung được cho cả hai.
- Bếp dùng một tài khoản chung trên thiết bị riêng. Owner và quản lý được làm thao tác bếp khi bất khả kháng, có đánh dấu riêng trong log (ký hiệu ✓⚠ trong ma trận quyền).
- Module nhân viên giai đoạn này chỉ gồm tài khoản và PIN.
- Mật khẩu tạm sinh ngẫu nhiên, dùng được cho đến lần đăng nhập đầu.
- Config `confirm_all_customer_orders` mặc định BẬT. Chế độ TẮT chưa chốt quy trình.
- Chuyển bàn bằng cách di chuyển phiên. Không làm tách bill.
- Log lưu 10 năm (liên quan tiền và chứng từ) hoặc 2 năm (phần còn lại).
- Mã giảm giá chỉ owner phát hành, làm sau.
- Thêm mục 7.1: chuẩn định dạng phiếu 80mm.

### 2. Phiếu khổ 80mm
| Sửa gì | Sửa như thế nào | File |
|---|---|---|
| Layout chuẩn máy in nhiệt | Danh sách dòng (`text`, `row`, `rule`, `feed`) căn đúng **48 cột** (cỡ chữ 2 là 24 cột). Chuẩn hoá NFC để đếm cột chính xác với chữ có dấu. Ngắt dòng theo từ và giữ thụt lề | `src/lib/receipt/layout.ts` (mới) |
| Nội dung phiếu | Tên quán, địa chỉ, ĐT, MST. PHIẾU TẠM TÍNH hoặc PHIẾU THANH TOÁN (có số phiếu 7 chữ số khi bill ở trạng thái `paid`). Bàn, mã đơn, giờ Việt Nam. Món dạng `SL x đơn giá` và thành tiền. Tổng, giảm giá, số tiền bằng chữ. Thông tin người mua (chuẩn bị sẵn cho hoá đơn điện tử). Bỏ qua món đã huỷ | `src/lib/receipt/build.ts` (mới) |
| Số tiền bằng chữ | Đọc đúng các quy tắc linh, mốt, lăm, mười, không trăm, nghìn, triệu, tỷ | `src/lib/receipt/amount-in-words.ts` (mới) |
| HTML | Chỉ dùng inline style để hiển thị đúng trong email client. Mọi nội dung được escape | `src/lib/receipt/render-html.ts` (mới) |
| Thông tin người bán | Tạm đọc từ `RESTAURANT_*` trong env, sẽ chuyển vào `restaurant_settings` ở P0 | `src/lib/receipt/seller.ts` (mới) |
| Truy vấn đơn dùng chung | Tách `getOrderDetail()` và `parseOrderId()` ra khỏi route | `src/lib/orders.ts` (mới), `src/app/api/orders/[id]/route.ts` |
| API phiếu | `GET /api/orders/[id]/receipt` trả `{title, number, total, html, text}` | `src/app/api/orders/[id]/receipt/route.ts` (mới) |
| Trang preview | `/orders/[id]/bill` hiển thị phiếu, có nút **In thử** và form **Gửi email** | `src/app/orders/[id]/bill/page.tsx` |
| CSS in | `@media print`: chỉ in phần phiếu, rộng 72mm, cỡ chữ 2.5mm để vừa 48 cột | `src/app/globals.css` |

### 3. Gửi phiếu qua email
- `POST /api/admin/orders/[id]/receipt-email` với body `{email}`. **Tạm thời yêu cầu session quản trị**; sẽ chuyển sang vai trò `cashier` và ghi audit log ở P0.
- Email gồm bản HTML (phiếu 80mm nằm giữa) và bản text 48 cột.
- `src/lib/mailer.ts`: nodemailer qua SMTP. Development mặc định dùng `localhost:1025` (Mailpit). Production bắt buộc có `SMTP_HOST`, nếu thiếu thì trả 503. Lỗi SMTP trả 502.
- Thêm dependency `nodemailer@10.3.1` và `@types/nodemailer@8.0.2`, ghim phiên bản chính xác (chọn bản đã phát hành quá 2 tuần).
- Thêm service `mailpit` vào `docker-compose.yml` và script `npm run mail:up`. **Chưa khởi động container**, vì lệnh chạy container bị chặn quyền trong phiên làm việc này.

### Kiểm tra
- Đọc số tiền bằng chữ: 17/17 test đúng (0, 5, 10, 11, 15, 21, 25, 105, 110, 1.000, 1.005, 129.000, 2.500.000, 1.000.000.000, 1.000.001, 45.091.000, 1.215.000).
- Layout: không dòng nào vượt 48 cột, kể cả tên món dài phải ngắt dòng.
- `GET /api/orders/1/receipt` trên DB dev: ra phiếu tạm tính đúng. Mã đơn sai trả 400.
- Gửi email: chưa đăng nhập trả 401, email sai định dạng trả 400, chưa có SMTP trả 502 (báo lỗi ngay, không treo).
- Dựng thử file `.eml` hoàn chỉnh bằng `streamTransport` của nodemailer: thành công, tên món chứa `<script>` được escape.
- `tsc` OK, `eslint` 0 lỗi, `npm run build` OK.

### Còn tồn đọng
- Chưa test gửi thật tới hộp thư. Cần chạy `npm run mail:up` rồi gửi thử, xem tại http://localhost:8025.
- Chưa có luồng tạo bill và đánh dấu đã thanh toán, nên hiện mọi phiếu đều là PHIẾU TẠM TÍNH. Luồng này thuộc giai đoạn P2.
- Gửi lệnh in tới máy in nhiệt (ESC/POS, Web Bluetooth, in từ cloud) làm sau.

---

## 22/11/2026 — Chốt hướng sản phẩm và viết đặc tả quy trình (chưa sửa code)

**Yêu cầu:** Chốt mô hình triển khai và quy trình vận hành cho quán độc lập (hộ kinh doanh), phân tích các lỗ hổng còn lại.

**Đã làm:**
- Tạo [BUSINESS_PROCESS.md](BUSINESS_PROCESS.md) gồm: cấp tài khoản, ma trận quyền, đăng nhập và PIN, vòng đời phiên bàn, lượt gọi đầu tiên và order rác, chuyển bàn và gộp bàn, trạng thái từng món, kho và định lượng, phiếu thanh toán và hoá đơn điện tử, in và gửi email, audit log, quản trị nền tảng, rủi ro cho khách hàng, schema đề xuất, lộ trình P0–P5 và 9 câu hỏi mở.
- Các quyết định chính đã chốt:
  - Chạy trên cloud, một app và mỗi quán một database riêng, truy cập qua subdomain.
  - Vai trò `kitchen` luôn đứng riêng.
  - Lượt gọi đầu tiên của khách phải được nhân viên xác nhận; sau 10 phút không xác nhận thì thành order rác.
  - Đóng phiên bất thường cần owner duyệt.
  - Khách hàng mục tiêu là hộ kinh doanh, xuất hoá đơn bán hàng.

**Chưa đụng tới code.** Code chỉ được sửa sau khi chủ sản phẩm duyệt bản đặc tả.

---

## 21/11/2026 — Đồng bộ code với tài liệu `docs/`

**Bối cảnh:** Một số yêu cầu trước đó đã được gửi nhầm sang agent khác, nên code bị lệch khỏi tài liệu: build lỗi, docs ghi "đã xong" một số mục mà code chưa làm đúng.

### 1. Sửa lỗi build và lint

| Vấn đề | Sửa như thế nào | File |
|---|---|---|
| `dish.icon` không còn tồn tại trên type `Dish` (sau khi đổi sang `image_url`/`highlight_badge`) khiến `tsc`/`next build` lỗi | Thumbnail trong giỏ hàng hiển thị `image_url`, nếu NULL thì dùng icon mặc định 🍽️, giống `MenuList` | `src/app/page.tsx` |
| `setState` đồng bộ trong `useEffect` (lint `react-hooks`) | `setTableId` chuyển vào callback sau khi gọi `/api/tables/[id]`. Kèm thêm: nếu bàn trả 404 thì không gán `tableId` và hiện "Mã QR bàn không hợp lệ" | `src/app/page.tsx` |
| State `orderStatus` không dùng | Xoá | `src/app/page.tsx` |
| `catch (error: any)` ở 4 API admin | Thêm helper `pgErrorCode(error: unknown)` trong `lib/db.ts`, rồi so sánh `pgErrorCode(error) === "23505"` / `"23503"` | `src/lib/db.ts`, `src/app/api/admin/{menu,menu/categories,staff,tables}/route.ts` |
| `useState<any>` và `(item: any)` ở trang đơn/hoá đơn | Tạo type `OrderDetail`, `OrderItem`, `OrderStatusEvent`, `Bill` khớp với response của `GET /api/orders/[id]` | `src/types/order.ts` (mới), `src/app/orders/[id]/page.tsx`, `src/app/orders/[id]/bill/page.tsx` |
| `<a href="/">` thay vì `<Link>` | Đổi sang `next/link`, kể cả 3 link trong drawer điều hướng của trang khách | `src/app/orders/**/page.tsx`, `src/app/page.tsx` |
| Biến `icon`, `tag` đọc từ body nhưng không dùng | Xoá | `src/app/api/admin/menu/[id]/route.ts` |

### 2. Danh mục ở trang khách lấy từ database

- **Trước:** danh mục là mảng cố định trong `src/data/menu.ts`, và `DishCategory` là union cố định, nên danh mục admin thêm qua `/api/admin/menu/categories` không hiện ở trang khách.
- **Sau:**
  - `GET /api/menu` trả thêm `categories`: các danh mục `is_active` có ít nhất 1 món đang bán, sắp theo `sort_order`.
  - Trang khách hiển thị `["Tất cả", ...categories]`. Nếu API lỗi thì dùng dữ liệu dự phòng trong `src/data/menu.ts`.
  - `DishCategory` đổi thành `string`. Thêm hằng `ALL_CATEGORY = "Tất cả"` để không viết cứng chuỗi ở nhiều chỗ.
- **File:** `src/types/menu.ts`, `src/data/menu.ts`, `src/app/api/menu/route.ts`, `src/app/page.tsx`, `src/components/MenuList.tsx`.

### 3. Tạo đơn: không bán vượt tồn kho, chống đơn trùng thật sự

- **Bán vượt tồn kho:** câu `SELECT` món trong `POST /api/orders` thêm `ORDER BY id FOR UPDATE`. Các dòng món bị khoá đến khi COMMIT, nên hai đơn đồng thời không thể cùng đọc stock cũ. `ORDER BY id` giữ thứ tự khoá cố định để tránh deadlock.
- **Request song song cùng key:** đầu transaction gọi `pg_advisory_xact_lock(hashtext(idempotencyKey))`. Request đến sau sẽ chờ, thấy đơn đã tạo và trả `200 duplicate: true` thay vì lỗi 500 do unique index.
- **Retry sau lỗi mạng:** trước đây client sinh key mới mỗi lần bấm. Giờ key được giữ trong `useRef`, chỉ xoá khi tạo đơn thành công hoặc khi giỏ thay đổi (thêm/bớt món tức là một đơn khác).
- **JSON hỏng:** `request.json()` lỗi thì trả 400 thay vì 500.
- **File:** `src/app/api/orders/route.ts`, `src/app/page.tsx`.

### 4. Database dev và seed

- DB dev thiếu cột `image_url`, `highlight_badge` (có trong `init.sql` nhưng chưa được chạy), khiến `/api/menu` trả 503. Đã chạy riêng 2 câu `ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS ...` (không chạy cả `db:init` vì script đó đặt lại trạng thái bàn 11–13).
- Seed `scripts/init-db.mjs` thêm `highlight_badge` cho 6 món mẫu, để DB tạo mới bằng `db:reset` có badge giống dữ liệu dự phòng.

### 5. Tài liệu

- `ARCHITECTURE_DATABASE.md`: viết lại cây thư mục, bảng schema đầy đủ, luồng menu và luồng tạo đơn mới.
- `IMPLEMENTATION_STATUS.md`: bỏ các mục mâu thuẫn ("đang triển khai" nhưng đã xong), bảng route đầy đủ, cập nhật ghi chú build.
- `ROADMAP.md`: đánh dấu các mục đã hoàn thành.
- `README.md`: thêm link tới file này.

### Kiểm tra

- `npx tsc --noEmit`: OK.
- `npx eslint src`: 0 lỗi, 8 warning (`<img>` và `window.location.assign`, chưa sửa).
- `npm run build`: thành công.
- Test trên dev server và DB, dữ liệu test đã được dọn:
  - stock = 1, 2 đơn khác key gửi đồng thời: 1 đơn `201`, 1 đơn `409 Không đủ số lượng`; stock còn 0 (không âm).
  - 3 request cùng key gửi đồng thời: `201`, `200`, `200`; chỉ 1 đơn được tạo, stock chỉ trừ 1 lần.
  - Body JSON hỏng: `400`.
  - `GET /api/menu` trả 6 món và 4 danh mục từ DB.

### Còn tồn đọng

- Chưa kiểm tra role/permission, chưa có CSRF, rate limit đăng nhập; salt mật khẩu vẫn cố định.
- Warning `<img>`: cần cấu hình `images.remotePatterns` nếu muốn chuyển sang `next/image`.
