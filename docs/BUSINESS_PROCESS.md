# Đặc tả quy trình nghiệp vụ

Trạng thái: **ĐÃ TRIỂN KHAI** phần P0–P2 (22/11/2026). Tạo ngày 22/11/2026, cập nhật theo câu trả lời Q1–Q9. Phần chưa làm: xem [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md#chưa-thực-hiện).
Đây là nguồn chuẩn cho các thiết kế và code tiếp theo. Mọi thay đổi quyết định đều phải cập nhật vào file này và ghi vào [CHANGELOG.md](CHANGELOG.md).

Ký hiệu: ✅ đã chốt · 💡 đề xuất, chờ chủ sản phẩm duyệt · ❓ câu hỏi mở (xem mục 13).

---

## 1. Phạm vi và mô hình triển khai

- ✅ Toàn bộ ứng dụng chạy trên cloud (VPS hoặc cloud riêng). Thiết bị tại quán chỉ cần trình duyệt và kết nối mạng (wifi hoặc 4G).
- ✅ **Khách gọi món** chỉ cần có mạng và mở đường dẫn trên trình duyệt điện thoại (quét QR), không cài app.
- ✅ **Nhân viên, bếp, owner** sau này dùng app mobile. **Giai đoạn hiện tại làm toàn bộ trên web**; app mobile để giai đoạn sau. Vì vậy API phải thiết kế để web và app mobile dùng chung.
- ✅ Khách hàng mục tiêu đầu tiên là **hộ kinh doanh** quán ăn, nhà hàng nhỏ lẻ, hộ gia đình chưa chuyển đổi số. Giá thuê thấp, nên chi phí hạ tầng phải thấp nhất có thể.
- ✅ Hai loại đăng ký: **quán độc lập** và **chuỗi**. Chuỗi có thêm cấp quản trị chung ở trên các owner. **Giai đoạn đầu chỉ làm quán độc lập.**
- ✅ **Một app (một codebase, một lần deploy), mỗi quán một database riêng, truy cập qua subdomain riêng** (`ten-quan.<domain>`).
  - Có thêm một database điều khiển (`platform`), chứa danh sách quán, gói thuê, trạng thái và số liệu tổng hợp cho dashboard của quản trị nền tảng.
  - Một migration chạy lần lượt cho mọi database của các quán.
- ✅ Thứ tự làm: quy trình lõi (gọi món → bếp → phục vụ → thanh toán) → kho nguyên liệu → chấm công, lương (tuỳ chọn) → thuế, hoá đơn điện tử, cổng thanh toán, đơn ship, quảng cáo.

## 2. Cấp tài khoản

| Cấp | Số lượng | Phạm vi |
|---|---|---|
| **Quản trị nền tảng** | 1 (chủ sản phẩm) | Truy cập mọi quán. Đăng nhập bằng mật khẩu + OTP gửi về email cá nhân. **Mỗi lần truy cập vào một quán đều ghi vào log của quán đó và owner nhìn thấy.** |
| **Owner** | 1 / quán | Toàn quyền quản trị và vận hành |
| **Quản lý** | 0–2 / quán | ✅ Tài khoản hỗ trợ vận hành, dùng khi các tài khoản con thiếu vai trò. **Không** được CRUD tài khoản, xem log, vào trang quản trị hay sửa config |
| **Nhân viên** | không giới hạn | Owner cấp. Giữ 1–2 vai trò theo luật ở mục 2.1 |
| **Khách** | — | Ẩn danh, truy cập bằng QR của bàn |

### 2.1 Vai trò của nhân viên

| Vai trò | Việc được làm |
|---|---|
| `order`: gọi món | Mở bàn, xác nhận lượt gọi của khách, thêm hoặc huỷ món chưa nấu, khôi phục order rác, chuyển bàn, gộp bàn |
| `runner`: chạy bàn | Bưng món, đánh dấu **đã phục vụ** (thao tác này xoá nhãn "món đã gọi") |
| `cashier`: thu ngân | Phiếu tạm tính, thu tiền, xác nhận thanh toán cuối, đề nghị đóng phiên bất thường |
| `kitchen`: bếp | Nhận món, đang làm, xong, huỷ món đã nấu (tính hao hụt), báo hết món hoặc còn món, ghi nhận nhập và xuất nguyên liệu |

Luật ghép vai trò:
- ✅ `kitchen` **luôn đứng riêng**, không ghép với vai trò nào khác.
- ✅ Tài khoản không có `kitchen` được giữ 1–2 vai trò trong số `order`, `runner`, `cashier`.
- ✅ (Q1) Bếp dùng **một tài khoản bếp chung** trên **thiết bị đặt riêng ở khu vực bếp**: tablet, hoặc mini PC màn hình cảm ứng nếu quán chịu đầu tư. Thiết bị này chỉ phục vụ bếp.
  - Hệ quả: log ghi "bếp" chứ không biết đầu bếp nào làm. Chấp nhận được với quán nhỏ.
  - Người kiêm bếp khi làm việc phục vụ thì dùng tài khoản phục vụ của mình.
- ✅ (Q1) Module nhân viên giai đoạn này **chỉ quản lý tài khoản và PIN**. Chấm công và lương để sau.
- ✅ (Q2) Owner và quản lý **vẫn có quyền** với các thao tác của bếp, nhưng **chỉ dùng trong trường hợp bất khả kháng**.
  - Mọi thao tác bếp do owner hoặc quản lý làm đều được đánh dấu riêng trong log và trong báo cáo, để owner biết tần suất.

### 2.2 Ma trận quyền

| Thao tác | Owner | Quản lý | order | runner | cashier | kitchen | Khách |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Xem menu, xem phiên của bàn mình | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gửi lượt gọi món (chờ xác nhận nếu là lượt đầu) | | | | | | | ✓ |
| Mở bàn, xác nhận lượt gọi đầu tiên | ✓ | ✓ | ✓ | | | | |
| Thêm món vào phiên đang mở | ✓ | ✓ | ✓ | | | | ✓ |
| Huỷ món **chưa** nấu | ✓ | ✓ | ✓ | | | | |
| Khôi phục order rác | ✓ | ✓ | ✓ | | | | |
| Chuyển bàn, gộp bàn | ✓ | ✓ | ✓ | | | | |
| Nhận món, đang làm, xong | ✓⚠ | ✓⚠ | | | | ✓ | |
| Huỷ món **đã** nấu (bắt buộc lý do, tính hao hụt) | ✓⚠ | ✓⚠ | | | | ✓ | |
| Báo hết món, còn món | ✓⚠ | ✓⚠ | | | | ✓ | |
| Đánh dấu đã phục vụ | ✓ | ✓ | | ✓ | | | |
| Phiếu tạm tính, thu tiền, xác nhận thanh toán | ✓ | ✓ | | | ✓ | | |
| Phát hành mã giảm giá (làm sau) | ✓ | | | | | | |
| Đề nghị đóng phiên bất thường | ✓ | ✓ | | | ✓ | | |
| **Duyệt** đóng phiên bất thường | ✓ | | | | | | |
| Điều chỉnh, thay thế hoá đơn đã phát hành | ✓ | | | | | | |
| Nhập kho, xuất huỷ nguyên liệu | ✓ | | | | | ✓ | |
| Kiểm kê, duyệt chênh lệch kho | ✓ | | | | | | |
| CRUD tài khoản, menu, định lượng, bàn | ✓ | | | | | | |
| Thống kê, thu chi, thuế, thông tin hiển thị, config | ✓ | | | | | | |
| Đổi tài khoản ngân hàng nhận tiền (cần OTP) | ✓ | | | | | | |
| Xem log audit (cần OTP) | ✓ | | | | | | |

✓⚠ = chỉ dùng khi bất khả kháng; thao tác được đánh dấu riêng trong log và báo cáo.

## 3. Tài khoản, đăng nhập, PIN, thiết bị

### 3.1 Cấp tài khoản
- ✅ Owner tạo tài khoản với: **username** do owner tự đặt (chữ thường không dấu, số, dấu `.` hoặc `_`; ví dụ `hoxuandung`, `dung.hoxuan`, `hxdung`; duy nhất trong quán), họ tên, vai trò, email (tuỳ chọn).
- ✅ (Q3) **Mật khẩu tạm do hệ thống sinh ngẫu nhiên**, chỉ hiện một lần cho owner. Không đặt thời hạn: mật khẩu tạm dùng được cho đến lần đăng nhập đầu tiên, và bắt buộc đổi ngay trong lần đó.
  - 💡 Nếu nhân viên làm mất mật khẩu tạm, owner bấm "cấp lại" để sinh mật khẩu mới; mật khẩu cũ mất hiệu lực.
- ✅ Ở lần đăng nhập đầu, nhân viên phải:
  - đổi mật khẩu (tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt);
  - đặt **PIN 6 số**;
  - thiết bị đang dùng được ghi nhận là thiết bị tin cậy.

### 3.2 Ca làm việc và PIN
```
Bắt đầu ca: username + mật khẩu  →  nhập PIN  →  danh sách bàn
Mỗi thao tác: chọn bàn → chọn vai trò → làm → [Hoàn thành] hoặc [Tiếp tục order bàn khác]
             → về lại danh sách bàn, phải nhập PIN cho thao tác tiếp theo
Nút [Khu vực bếp] luôn nằm phía trên danh sách bàn (chỉ tài khoản bếp dùng được)
```
- ✅ Trong một ca, các thao tác chỉ cần nhập PIN. Phiên kết thúc khi bấm "Hoàn thành". "Tiếp tục order bàn khác" giữ nguyên danh tính để order nhiều bàn liền mạch.
- 💡 Nếu không thao tác trong 60 giây thì tự thoát về màn hình nhập PIN. Việc này tránh trường hợp người trước để máy lại và người sau làm dưới tên người trước.
- 💡 **Thiết bị dùng chung** (một tablet ở quầy): nhiều nhân viên cùng đăng nhập ca trên một máy. Mỗi thao tác thì **chọn tên rồi nhập PIN**. Không nhận diện người dùng chỉ bằng PIN, vì PIN có thể trùng và dễ đoán.
- 💡 Nhập sai PIN 5 lần thì khoá PIN, phải đăng nhập lại bằng mật khẩu.
- 💡 Ca tự hết hạn sau tối đa 14 giờ, hoặc khi nhân viên chấm công ra (nếu bật chấm công).

### 3.3 Thiết bị
- ✅ Đăng nhập trên thiết bị mới thì phải đi lại từ đầu (mật khẩu rồi PIN), và hệ thống gửi cảnh báo cho owner và email của nhân viên (nếu có).
- 💡 Trình duyệt không cung cấp mã phần cứng. Vì vậy "thiết bị" được nhận diện bằng một **token ngẫu nhiên lưu trên trình duyệt**, kèm thông tin trình duyệt (user-agent). IP chỉ được lưu lại để tra cứu, **không** dùng để cảnh báo, vì IP của mạng 4G đổi liên tục.
- 💡 Xoá dữ liệu trình duyệt hoặc dùng tab ẩn danh sẽ bị coi là thiết bị mới.
- 💡 Tuỳ chọn trong config của owner: **thiết bị mới phải được owner duyệt** rồi mới dùng được.

## 4. Quy trình vận hành tại bàn

### 4.1 Phiên bàn

```
(trống) ──khách quét QR, gửi lượt gọi đầu──► [lượt chờ xác nhận]   (chưa tạo phiên)
   │                                             │ nhân viên order xác nhận
   │ nhân viên mở bàn trực tiếp                  ▼
   └────────────────────────────────────────► OPEN ──► thêm món, bếp, phục vụ
                                                 │
                     thu ngân thanh toán + xác nhận cuối bằng PIN
                                                 ▼
                                              CLOSED  (bàn trống trở lại)

OPEN ──thu ngân đề nghị đóng bất thường + lý do──► ABNORMAL_PENDING (bàn trống ngay)
        ──owner duyệt──► ABNORMAL_CLOSED (ghi nhận thất thoát)
        ──owner từ chối──► cần giải trình (lý do lưu trong log)
OPEN ──gộp vào phiên khác──► MERGED
```

- ✅ Mỗi bàn có tối đa **một phiên đang mở**. Database chặn điều này bằng unique index có điều kiện.
- ✅ Phiên chỉ đóng khi đã thanh toán **và** nhân viên thu ngân xác nhận lần cuối.
- 💡 Không thanh toán được khi còn món ở trạng thái chờ bếp, đang làm, hoặc xong mà chưa phục vụ. Mọi món phải ở trạng thái **đã phục vụ** hoặc **đã huỷ**. Luật này đảm bảo không có món nào được ra mà không nằm trên hoá đơn.
- 💡 Khi đóng phiên bất thường, bàn được **trả về trống ngay** để đón khách mới. Phần chờ owner duyệt không giữ bàn.
- Máy khách đã tham gia phiên được lưu ID phiên trong cookie. Khi máy quét lại QR:

| Tình huống | Xử lý |
|---|---|
| Bàn có phiên OPEN | Vào thẳng phiên hiện tại |
| Cookie trỏ tới phiên đã đóng | Bỏ cookie, xử lý như máy mới |
| Bàn chưa có phiên | Lượt gọi đầu tiên vào trạng thái chờ xác nhận |

### 4.2 Lượt gọi đầu tiên và order rác
- ✅ Lượt gọi đầu tiên của bàn **phải được nhân viên xác nhận** rồi mới vào bếp. Phiên chỉ được tạo khi lượt này được xác nhận.
- ✅ Sau **10 phút** không ai xác nhận, lượt gọi tự chuyển thành **order rác**. Nhân viên vẫn có thể chọn lại (khôi phục) order rác đó.
- 💡 Khi khôi phục, hệ thống **kiểm tra lại giá và số phần còn bán được**, vì trong 10 phút đó hệ thống không giữ chỗ cho món.
- 💡 Nhiều máy cùng bàn gửi lượt gọi khi bàn chưa có phiên: các lượt được **gom theo bàn**. Nhân viên xác nhận bàn và chọn những lượt hợp lệ.
- ✅ (Q4) Config `confirm_all_customer_orders`, **mặc định BẬT**: **mọi** lượt gọi của khách đều phải được nhân viên xác nhận rồi mới vào bếp.
- ⏳ Khi config TẮT (chỉ xác nhận lượt đầu): quy trình quản lý phiên **chưa chốt**, chủ sản phẩm sẽ bổ sung sau. Trước khi chốt, **chưa làm** chế độ TẮT.
  - Rủi ro cần cân nhắc: người cầm ảnh chụp QR có thể gọi món vào phiên đang mở của nhóm khác.
  - Biện pháp đã có: nhân viên thấy danh sách thiết bị đang tham gia phiên và loại được thiết bị lạ.

### 4.3 Nhãn "món đã gọi"
- ✅ Màn hình gọi món hiện nhãn "món đã gọi". Khi món đã được phục vụ tại bàn thì nhãn tự mất.
- ✅ Nhãn tính theo **phiên** (mọi máy cùng bàn đều thấy) và theo **số lượng** (gọi 2 phần mà mới ra 1 phần thì nhãn vẫn còn).
- ✅ Khách vẫn gọi trùng sau khi đã thấy nhãn, hoặc nhân viên xác nhận lượt gọi đó, thì đều là order hợp lệ.

### 4.4 Trạng thái từng món
```
chờ bếp ──► đang làm ──► xong ──► đã phục vụ
   │            │
   │            └──► huỷ sau khi nấu (bếp, bắt buộc lý do → hao hụt)
   ├──► huỷ trước khi nấu (order, tự do, có ghi log)
   └──► hết món (bếp từ chối → báo nhân viên order → món bị huỷ với lý do "hết món")
```

### 4.5 Chuyển bàn và gộp bàn (chỉ nhân viên làm, khách không thấy chức năng này)
- ✅ **Chuyển bàn 1 → bàn 2:** bàn 2 nhận phiên mang thông tin của bàn 1.
  - ✅ (Q5) Cách làm: **di chuyển chính phiên đó** (đổi bàn của phiên, ghi lại lịch sử), không sao chép sang phiên mới. Sao chép thì một món có thể nằm trên hai phiên, dẫn tới tính tiền hai lần. Các máy khách đã tham gia vẫn ở đúng phiên. Bàn 1 trở về trống.
- ✅ **Gộp bàn:** hai mã QR cùng trỏ tới một phiên.
  - 💡 Cách làm: món của phiên B chuyển sang phiên A, phiên B chuyển sang trạng thái MERGED, và bảng liên kết phiên–bàn gắn cả hai bàn vào phiên A. Khi thanh toán xong, cả hai bàn cùng trống.
- ✅ (Q6) **Không phát triển tách bill.** Mỗi phiên tương ứng với một phiếu thanh toán.

### 4.6 Loại đơn
- ✅ `dine_in` (tại chỗ, mặc định) và `delivery` (đơn ship, tích hợp sau).
- 💡 Thêm `takeaway` (mang về). Đơn mang về và đơn ship dùng **phiên không gắn bàn**.

## 5. Kho nguyên liệu và số phần bán được

### 5.1 Cách tính (theo ý tưởng của chủ sản phẩm)
- ✅ Owner khai báo **định lượng** cho từng món khi tạo món trên menu.
- **Số phần làm được của một món = phần nhỏ nhất trong các phép chia `floor(tồn kho / định lượng)` của từng nguyên liệu trong món đó.**

Kiểm tra với ví dụ: nhập 1000g thịt và 40g rau.

| Món | Định lượng | Ban đầu | Sau khi bán 1 phần món A (thịt còn 800g) |
|---|---|---|---|
| A | 200g thịt (+ hành, tỏi) | 1000/200 = **5** | 800/200 = **4** |
| B | 100g thịt, 1g rau (+ tỏi) | min(10, 40) = **10** | min(8, 40) = **8** |
| C | 400g thịt, 20g rau | min(2, 2) = **2** | min(2, 2) = **2** |

Phép tính đúng như bạn mô tả. Tính toán thì đơn giản; **phần khó là dữ liệu đầu vào thực tế**:

| Vấn đề | Xử lý đề xuất |
|---|---|
| Hành và tỏi **chưa được nhập kho** nên theo đúng công thức, món A và B sẽ ra **0 phần** | 💡 Chia nguyên liệu thành 2 loại: **theo dõi** (thịt, cá, rau chính: có tính số phần) và **không theo dõi** (gia vị, dầu, nước mắm: chỉ ghi nhận nhập và chi phí, không chặn bán) |
| Bếp không cân chính xác từng gram, thịt sống sơ chế xong còn ít hơn | 💡 Mỗi nguyên liệu có **hệ số hao hụt**. **Kiểm kê định kỳ** để đưa tồn kho trên hệ thống về đúng thực tế. Chênh lệch kiểm kê chính là phần nấu ngoài hệ thống hoặc thất thoát, và owner thấy được |
| Mua theo bó, theo con, theo kg nhưng định lượng tính bằng gram | 💡 Khai báo đơn vị mua, đơn vị dùng và tỷ lệ quy đổi giữa chúng |
| Các món **dùng chung** một nguyên liệu: "A còn 4, B còn 8" là các phương án loại trừ nhau, không cộng lại được | 💡 Hiển thị là "**tối đa** 4 phần" |
| Tồn kho hệ thống lệch với thực tế nên có thể chặn nhầm một món vẫn nấu được | 💡 Mặc định chỉ **cảnh báo**, không chặn. Bếp có nút "**còn món**" để ghi đè (có ghi log). Owner có thể bật chế độ chặn cứng |
| Món nấu theo mẻ (nồi nước dùng, cả nồi cơm) | 💡 Giai đoạn sau: **bán thành phẩm** có định lượng riêng |

### 5.2 Thời điểm trừ kho
- 💡 **Giữ chỗ** khi lượt gọi được xác nhận, để không bán vượt số phần.
- 💡 **Trừ thật** khi bếp đánh dấu "xong".
- 💡 **Trả lại** khi huỷ món trước khi nấu.
- 💡 Huỷ món sau khi nấu thì tính vào **hao hụt**.

### 5.3 Có phù hợp với hộ gia đình không
Có, nếu chỉ theo dõi **3–10 nguyên liệu chính**. Không phù hợp nếu bắt khai báo đủ mọi gia vị. Vì vậy:
- 💡 Module kho là **tuỳ chọn**. Khi chưa bật module kho, quán dùng số phần nhập tay (cột `stock` hiện có).

## 6. Thanh toán và chứng từ (hộ kinh doanh)

> ⚠️ Thông tin pháp lý dưới đây là theo hiểu biết của nhóm phát triển về Nghị định 123/2020, Thông tư 78/2021, Nghị định 70/2025 và Thông tư 40/2021. **Phải xác minh lại với kế toán hoặc cơ quan thuế trước khi làm module thuế.**
> - Hộ kinh doanh xuất **hoá đơn bán hàng**, không xuất hoá đơn GTGT ("hoá đơn đỏ"). Khách công ty vẫn được ghi tên, MST và địa chỉ trên hoá đơn bán hàng.
> - Hộ kinh doanh có doanh thu đến một ngưỡng nhất định phải dùng **hoá đơn điện tử khởi tạo từ máy tính tiền**.
> - Tỷ lệ thuế tính trên doanh thu của ngành ăn uống được tính ở module thuế, không in trên từng dòng của hoá đơn.

### 6.1 Tách hai tầng (để ghép module thuế sau này không phải làm lại)

| Tầng | Có khi nào | Nội dung |
|---|---|---|
| **Phiếu thanh toán** (`bills`) | Luôn có, từ giai đoạn 1 | Chứng từ nội bộ, số liên tục theo quán, không sửa và không xoá được |
| **Hoá đơn điện tử** (`einvoices`) | Khi bật module hoá đơn điện tử | Sinh ra từ phiếu thanh toán. Có mẫu số, ký hiệu, số hoá đơn hợp pháp và mã của cơ quan thuế |

### 6.2 Vòng đời phiếu thanh toán
```
TẠM TÍNH (draft: xem trước, thêm món thì tính lại)
  → THU TIỀN (một hoặc nhiều lần thanh toán: tiền mặt, chuyển khoản, kết hợp)
  → PHÁT HÀNH khi thu ngân xác nhận cuối bằng PIN
      · cấp số liên tục trong cùng transaction, không bị nhảy số
      · khoá dòng món: chụp lại tên, đơn vị tính, số lượng, đơn giá, giảm giá, thành tiền
      · chụp lại thông tin người bán: tên hộ kinh doanh, MST, địa chỉ
      · lưu thông tin người mua nếu khách yêu cầu: tên, công ty, MST, địa chỉ, email
      · lưu tổng tiền bằng số và bằng chữ
  → In, gửi email, hoặc hiện QR xem hoá đơn → đóng phiên

Sai sót sau khi phát hành: chỉ owner xử lý, bằng PHIẾU ĐIỀU CHỈNH hoặc PHIẾU THAY THẾ,
có liên kết tới phiếu gốc. Không bao giờ sửa trực tiếp phiếu đã phát hành.
```

### 6.3 Các trường dữ liệu chuẩn bị sẵn cho hoá đơn điện tử
- Phiếu: thời điểm lập, người bán (snapshot), người mua, tổng tiền trước giảm giá, giảm giá, tổng thanh toán, tổng tiền bằng chữ, phiếu gốc và loại liên kết (điều chỉnh hoặc thay thế).
- Dòng: tên hàng, đơn vị tính, số lượng, đơn giá, thành tiền, giảm giá.
- Hoá đơn điện tử (sau này): mẫu số, ký hiệu, số hoá đơn, mã cơ quan thuế, trạng thái gửi (chờ, đã cấp mã, bị từ chối), dữ liệu gửi và nhận với nhà cung cấp.
- 💡 Viết sẵn interface `EInvoiceProvider`, hiện dùng bản giả lập. Sau này nối VNPT, Viettel, MISA hay bên khác chỉ cần thêm một adapter.

### 6.4 Chuyển khoản (giai đoạn 1: mô phỏng)
- ✅ Hiện **mã VietQR** kèm số tiền cần trả. 💡 Mã được tạo theo chuẩn EMVCo nên là **QR thật**: app ngân hàng quét được và chuyển được ngay.
- 💡 Nội dung chuyển khoản chứa **mã phiếu duy nhất**, để sau này tự đối soát qua webhook của cổng thanh toán.
- Giai đoạn 1: thu ngân xác nhận "đã nhận tiền" bằng PIN. Tích hợp cổng thanh toán làm sau cùng, khi đã có tài liệu kết nối.
- Tài khoản ngân hàng nhận tiền: chỉ owner được đổi, và phải xác thực OTP.

## 7. In và gửi hoá đơn

✅ Có hai cách, chọn khi thanh toán: (1) in bằng máy in nhiệt, (2) gửi email. Cách gửi email dùng được cả cho khách cần xuất hoá đơn công ty.

**Đánh giá cách "in qua hộp thoại in của trình duyệt, khổ 80mm" trên điện thoại:**

| Thiết bị | Hộp thoại in của trình duyệt | Kết luận |
|---|---|---|
| PC hoặc laptop (có driver máy in) | Chọn được khổ 80mm, in tốt | ✅ Dùng được |
| Android (Chrome) | Đi qua dịch vụ in của Android, cần plugin riêng của hãng máy in. Máy in nhiệt giá rẻ gần như không có plugin, hoặc in ra trang A4 thu nhỏ | ❌ Không tin cậy |
| iPhone (Safari) | Chỉ in được qua AirPrint, rất ít máy in nhiệt hỗ trợ | ❌ Gần như không dùng được |

💡 Đề xuất cho mô hình chạy trên điện thoại, không cần máy POS hay PC:
1. **Mặc định: hoá đơn điện tử dạng QR, link hoặc email.** Không tốn tiền, dùng được ngay cả khi mất điện.
2. **Android + máy in nhiệt Bluetooth BLE giá rẻ:** trang web gửi lệnh in ESC/POS **trực tiếp qua Web Bluetooth**, không cần cài app. Chrome trên Android có hỗ trợ; Safari trên iPhone thì không. Khi mua máy in phải chọn loại có **BLE**, vì nhiều máy giá rẻ chỉ có Bluetooth Classic.
3. **Máy in có tính năng in từ cloud** (Star CloudPRNT, Epson Server Direct Print): máy in tự lấy lệnh in từ server, nên **mọi điện thoại kể cả iPhone đều in được**. Đổi lại máy đắt hơn.
4. Hộp thoại in của trình duyệt: chỉ là phương án dự phòng cho PC hoặc laptop.

✅ (Q7) Chốt:
- Quán đã có sẵn thiết bị và máy in nhiệt được kết nối thì hệ thống **gửi lệnh in bình thường**.
- **Hiện tại:** làm **bản preview phiếu khổ 80mm đúng chuẩn định dạng** và **gửi phiếu qua email**. Phần này đã làm xong, xem mục 7.1.
- Gửi lệnh in tới máy in nhiệt (Web Bluetooth hoặc in từ cloud) làm sau, và dùng lại đúng layout của mục 7.1.

### 7.1 Chuẩn định dạng phiếu 80mm (đã triển khai)
- Khổ giấy 80mm, vùng in khoảng 72mm, tương đương 576 điểm ở 203dpi. Font A rộng 12 điểm, nên mỗi dòng có **48 cột**. Dòng cỡ chữ 2 (nhân đôi chiều ngang) có 24 cột.
- **Một layout dạng dòng duy nhất** (`src/lib/receipt/layout.ts`), từ đó render ra: HTML để xem trước, HTML cho email, text 48 cột cho bản text của email. Sau này cũng render ra lệnh ESC/POS từ cùng layout này, nên bản in luôn giống bản xem trước.
- Nội dung phiếu, theo thứ tự:
  1. Tên quán (cỡ chữ 2), địa chỉ, điện thoại, MST nếu có.
  2. Tiêu đề: **PHIẾU TẠM TÍNH** (chưa thanh toán) hoặc **PHIẾU THANH TOÁN** (đã thanh toán, có số phiếu).
  3. Bàn, mã đơn, thời điểm (giờ Việt Nam).
  4. Dòng món: tên món, rồi dòng `SL x đơn giá` và thành tiền.
  5. Tổng tiền hàng, giảm giá, **TỔNG THANH TOÁN**, **số tiền bằng chữ**.
  6. Thông tin người mua nếu có (đơn vị, MST, địa chỉ).
  7. Ghi chú "Phiếu nội bộ, không thay thế hoá đơn điện tử".
- ⚠️ Lưu ý cho giai đoạn in thật: nhiều máy in nhiệt giá rẻ **không có bảng mã tiếng Việt**. Khi đó gửi phiếu dưới dạng **ảnh (raster)** thay vì gửi chữ để không lỗi dấu. Cần quyết định khi chọn máy in.

## 8. Log audit
- ✅ Ghi **mọi** thao tác, chia 2 loại: **thao tác của quán** (nhân viên, quản lý, owner, quản trị nền tảng) và **thao tác của khách**.
- ✅ Không ai được sửa hoặc xoá log. Database chặn bằng trigger. 💡 Thêm **chuỗi băm** (mỗi dòng chứa hash của dòng trước) để phát hiện nếu có người sửa trực tiếp vào database.
- ✅ Owner xem log bằng **mã OTP gửi qua email hoặc SMS**. 💡 Mã OTP cho phép xem log trong 15 phút. **Bản thân việc xem log cũng được ghi log.**
- Mỗi dòng log gồm: thời điểm, người thực hiện, vai trò lúc thực hiện, thiết bị, IP, hành động, đối tượng bị tác động, giá trị trước và sau, phiên bàn, lý do (nếu có).
- Log của khách chỉ lưu ID ẩn danh của thiết bị, không lưu dữ liệu cá nhân (theo Nghị định 13/2023).
- ✅ (Q8) Thời gian lưu log: **10 năm** cho log liên quan tiền và chứng từ, **2 năm** cho phần còn lại.

## 9. Quản trị nền tảng
- ✅ Đăng nhập bằng mật khẩu + OTP gửi về email cá nhân của quản trị nền tảng.
- ✅ **Đổi email nhận OTP:** xác thực OTP ở email cũ, sau đó xác thực OTP ở email mới. Chỉ khi cả hai bước thành công thì mới đổi.
- 💡 Có **mã khôi phục dự phòng**, in ra giấy và cất riêng, dùng khi mất quyền truy cập cả hai email.
- 💡 Mã OTP hết hạn sau 5 phút, chỉ dùng được một lần, và giới hạn số lần gửi.
- ✅ Dashboard tổng: một job định kỳ đọc từng database của các quán và ghi số liệu vào database `platform`.

## 10. Rủi ro cần ghi rõ cho khách hàng (đưa vào hợp đồng hoặc hướng dẫn sử dụng)
- Hệ thống cần internet. Thiết bị của nhân viên nên có **SIM 4G** để vẫn chạy khi wifi của quán mất (mất điện thì router cũng tắt). Tablet chỉ có wifi sẽ mất kết nối khi router tắt.
- Máy in nhiệt cần điện. Khi mất điện, gửi hoá đơn qua QR hoặc email.
- Khi server của nền tảng gặp sự cố, mọi quán cùng bị ảnh hưởng. Nhà cung cấp phải giám sát, sao lưu hằng ngày ra một nơi khác, và đã thử quy trình khôi phục.
- QR dán trên bàn có thể bị chụp lại. Hệ thống giảm rủi ro bằng bước xác nhận lượt gọi đầu tiên và chức năng loại thiết bị lạ, nhưng không loại bỏ hoàn toàn.
- Số phần tính theo định lượng chỉ chính xác khi quán nhập kho và kiểm kê đều đặn.
- Phiếu thanh toán chưa phải hoá đơn điện tử hợp pháp cho tới khi bật module hoá đơn điện tử.

## 11. Schema đề xuất (database của mỗi quán)

> ✅ Đã triển khai thành migration. Thiết kế chi tiết, các luật DB tự chặn và bảng đối chiếu nằm ở [DATABASE_DESIGN.md](DATABASE_DESIGN.md).
> Một số tên bảng khác với bảng tóm tắt dưới đây: `tables` → `dining_tables`; có thêm `otp_challenges`, `stocktakes` và `stocktake_lines`.

| Nhóm | Bảng |
|---|---|
| Cấu hình | `restaurant_settings` (thông tin hiển thị, người bán, tài khoản ngân hàng, các config) |
| Nhân sự | `accounts` (username, password_hash, pin_hash, vai trò, trạng thái, bắt buộc đổi mật khẩu), `devices`, `shifts` (ca đăng nhập). `employees` (chấm công, lương) để sau |
| Bàn và phiên | `tables`, `table_sessions` (1 phiên = 1 phiếu; loại đơn, trạng thái, mở bởi ai, đóng bởi ai), `session_tables` (phục vụ gộp bàn), `session_devices` (máy khách đã tham gia) |
| Gọi món | `order_rounds` (lượt gọi: nguồn từ khách hay nhân viên, trạng thái chờ xác nhận / đã xác nhận / rác / bị từ chối), `order_items` (trạng thái từng món, giá snapshot) |
| Menu và kho | `menu_categories`, `menu_items`, `ingredients` (có theo dõi hay không, đơn vị, hệ số hao hụt), `recipes` (định lượng món–nguyên liệu), `stock_movements` (nhập, giữ chỗ, xuất, huỷ, kiểm kê) |
| Thanh toán | `bills`, `bill_lines`, `payments`, `bill_sequences`, (sau này) `einvoices` |
| Phê duyệt | `approvals` (đóng phiên bất thường, chênh lệch kiểm kê, ...) |
| Log | `audit_log` (loại: quán hoặc khách, chuỗi băm, chỉ cho phép thêm) |

Quy ước chung:
- Khoá chính dùng UUID.
- Không xoá cứng; xoá mềm bằng `deleted_at` hoặc cột trạng thái.
- Tiền là số nguyên VND.
- Thời gian dùng `TIMESTAMPTZ`.
- Migration là các file SQL đánh số, có runner chạy cho mọi database của các quán.

## 12. Lộ trình triển khai đề xuất

| Giai đoạn | Nội dung |
|---|---|
| **P0 Nền tảng** | Subdomain → database của quán, database `platform`, migration runner, tài khoản, PIN, thiết bị, phân quyền, audit log |
| **P1 Vận hành** | Bàn, phiên bàn, lượt gọi và order rác, bếp, phục vụ, nhãn "món đã gọi", chuyển bàn và gộp bàn |
| **P2 Thanh toán** | Phiếu tạm tính, thu tiền, phiếu thanh toán, VietQR mô phỏng, email, in bằng Web Bluetooth, đóng phiên bất thường kèm duyệt |
| **P3 Kho** | Nguyên liệu, định lượng, số phần bán được, kiểm kê |
| **P4 Nhân sự** | Chấm công, lương (tuỳ chọn, có thể tắt với hộ gia đình) |
| **P5 Nền tảng** | Dashboard tổng của quản trị nền tảng |
| Sau đó | Hoá đơn điện tử, thuế, cổng thanh toán, đơn ship, chuỗi, quảng cáo |

Code hiện tại (bảng `admin_users`, `staff_users`, khoá `SERIAL`, xoá cứng, chưa có phân quyền) sẽ phải được **thiết kế lại phần lớn ở tầng schema và API**. Phần giao diện (menu, giỏ hàng, drawer) giữ lại được.

## 13. Câu hỏi mở

| # | Trạng thái |
|---|---|
| Q1–Q3, Q5–Q8 | ✅ Đã chốt ngày 22/11/2026 (ghi chú `(Qn)` trong các mục ở trên) |
| Q4 | ✅ Đã chốt config mặc định BẬT. ⏳ Quy trình khi TẮT config: chủ sản phẩm bổ sung sau |
| Q9 | ✅ Mã giảm giá chỉ owner phát hành, làm sau. Giảm theo % làm sau. Chưa làm voucher |
