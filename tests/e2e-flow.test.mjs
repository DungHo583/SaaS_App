/**
 * Kiểm thử end-to-end toàn bộ quy trình qua HTTP (58 bước): owner lần đầu → cấu hình → cấp tài khoản →
 * khách quét QR gọi món → nhân viên xác nhận → bếp → thu ngân (VietQR, tiền mặt) → phát hành phiếu →
 * PIN / khoá màn hình → order rác → chuyển bàn → đóng bất thường + owner duyệt → log.
 *
 * Chạy trên một QUÁN TEST RIÊNG (script đổi mật khẩu owner của quán đó):
 *   npm run tenant:create -- e2etest "Quán Test E2E" owner.test "Owner Test" owner@test.local --demo > /tmp/e2e-tenant.txt
 *   npx next dev -p 3100            # terminal khác
 *   npm run test:e2e -- /tmp/e2e-tenant.txt
 * Biến môi trường: E2E_PORT (3100), E2E_SLUG (e2etest), E2E_DATABASE_URL (tenant_<slug>).
 */
import http from "node:http";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const SLUG = process.env.E2E_SLUG ?? "e2etest";
const HOST = `${SLUG}.localhost:${PORT}`;
const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL ?? `postgresql://saas_app:saas_app_dev@localhost:5432/tenant_${SLUG.replace(/-/g, "_")}` });
const tempOwner = fs.readFileSync(process.argv[2], "utf8").match(/một lần\): (.+)/)[1].trim();
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); } };

function client(name) {
  const jar = new Map();
  return async function call(method, path, body) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: PORT, path, method, headers: {
        host: HOST, "user-agent": `e2e-${name}`, ...(payload ? { "content-type": "application/json" } : {}),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      } }, (res) => {
        for (const c of res.headers["set-cookie"] ?? []) { const [kv] = c.split(";"); const [k, v] = kv.split("="); if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v); }
        let data = ""; res.on("data", (d) => data += d); res.on("end", () => { let json = {}; try { json = JSON.parse(data); } catch {} resolve({ status: res.statusCode, body: json }); });
      });
      req.on("error", reject); if (payload) req.write(payload); req.end();
    });
  };
}

await db.connect();
const owner = client("owner"), staff = client("staff"), kitchen = client("kitchen"), guest = client("guest"), guest2 = client("guest2");
const PIN = "135792", NEWPW = "Owner#2026x";

console.log("1. Owner đăng nhập lần đầu");
let r = await owner("POST", "/api/auth/login", { username: "owner.test", password: "sai-mat-khau" });
check("sai mật khẩu → 401", r.status === 401);
r = await owner("POST", "/api/auth/login", { username: "owner.test", password: tempOwner });
check("mật khẩu tạm → 200 + bắt đổi mật khẩu", r.status === 200 && r.body.mustChangePassword === true, JSON.stringify(r.body));
r = await owner("GET", "/api/staff/board");
check("chưa đổi mật khẩu → 428", r.status === 428);
r = await owner("POST", "/api/auth/first-login", { newPassword: "yeu", pin: PIN });
check("mật khẩu yếu → 400", r.status === 400);
r = await owner("POST", "/api/auth/first-login", { newPassword: NEWPW, pin: "111111" });
check("PIN 111111 → 400", r.status === 400);
r = await owner("POST", "/api/auth/first-login", { newPassword: NEWPW, pin: PIN });
check("đổi mật khẩu + PIN → 200", r.status === 200, JSON.stringify(r.body));
r = await owner("GET", "/api/auth/me");
check("me: pinFresh, quyền admin", r.body.pinFresh === true && r.body.capabilities.includes("admin"));

console.log("2. Owner cấu hình & cấp tài khoản");
r = await owner("PATCH", "/api/admin/settings", { address: "1 Lê Lợi, Q1", taxCode: "0312345678", phone: "0909000000" });
check("cập nhật thông tin quán", r.status === 200 && r.body.settings.tax_code === "0312345678");
r = await owner("PATCH", "/api/admin/settings", { taxCode: "123" });
check("MST sai → 409 thông điệp tiếng Việt", r.status === 409 && /MST/.test(r.body.error), JSON.stringify(r.body));
r = await owner("PATCH", "/api/admin/settings", { bankBin: "970436", bankAccountNo: "0123456789", bankAccountName: "Test" });
check("đổi tài khoản ngân hàng khi chưa OTP → 403 otp_required", r.status === 403 && r.body.code === "otp_required");
r = await owner("POST", "/api/admin/otp", { purpose: "view_audit" });
check("gửi OTP khi chưa có SMTP → lỗi rõ ràng (502)", r.status === 502, JSON.stringify(r.body));
await db.query("UPDATE restaurant_settings SET bank_bin='970436', bank_account_no='0123456789', bank_account_name='QUAN TEST'"); // giả lập đã qua OTP
r = await owner("POST", "/api/admin/accounts", { username: "nv.thu", fullName: "Nhân viên Thu", accountType: "staff", roles: ["order", "kitchen"] });
check("staff order+kitchen → 400", r.status === 400);
r = await owner("POST", "/api/admin/accounts", { username: "nv.thu", fullName: "Nhân viên Thu", accountType: "staff", roles: ["order", "cashier"] });
check("tạo staff order+cashier → mật khẩu tạm", r.status === 201 && r.body.temporaryPassword?.length === 12, JSON.stringify(r.body));
const staffTemp = r.body.temporaryPassword;
r = await owner("POST", "/api/admin/accounts", { username: "nv.thu", fullName: "Trùng", accountType: "staff", roles: ["order"] });
check("username trùng → 409", r.status === 409 && /Username/.test(r.body.error));
r = await owner("POST", "/api/admin/accounts", { username: "bep", fullName: "Bếp", accountType: "kitchen" });
const kitchenTemp = r.body.temporaryPassword;
check("tạo tài khoản bếp", r.status === 201);
r = await owner("POST", "/api/admin/accounts", { username: "bep2", fullName: "Bếp 2", accountType: "kitchen" });
check("tài khoản bếp thứ 2 → 409", r.status === 409, JSON.stringify(r.body));

console.log("3. Nhân viên & bếp đăng nhập");
await staff("POST", "/api/auth/login", { username: "nv.thu", password: staffTemp });
r = await staff("POST", "/api/auth/first-login", { newPassword: "Staff#2026x", pin: "246813" });
check("staff đổi mật khẩu + PIN", r.status === 200);
await kitchen("POST", "/api/auth/login", { username: "bep", password: kitchenTemp });
r = await kitchen("POST", "/api/auth/first-login", { newPassword: "Bep#2026xx", pin: "975310" });
check("bếp đổi mật khẩu + PIN", r.status === 200);
r = await staff("GET", "/api/admin/accounts");
check("staff vào API quản trị → 403", r.status === 403);
r = await kitchen("GET", "/api/staff/board");
check("bếp vào danh sách bàn → 403", r.status === 403);

console.log("4. Khách quét QR, gọi món (chờ xác nhận)");
const tables = (await db.query("SELECT id, name, qr_token FROM dining_tables ORDER BY sort_order")).rows;
r = await guest("GET", "/api/public/menu");
check("thực đơn công khai", r.status === 200 && r.body.dishes.length === 6 && r.body.restaurant.displayName === "Quán Test E2E");
const [d1, d2] = r.body.dishes;
r = await guest("GET", "/api/public/tables/khongtontai");
check("QR sai → 404", r.status === 404);
r = await guest("GET", `/api/public/tables/${tables[0].qr_token}`);
check("bàn trống: chưa có phiên", r.status === 200 && r.body.session === null);
const key = randomUUID();
r = await guest("POST", `/api/public/tables/${tables[0].qr_token}/rounds`, { idempotencyKey: key, items: [{ menuItemId: d1.id, quantity: 2 }, { menuItemId: d2.id, quantity: 1 }] });
check("gửi lượt đầu → pending", r.status === 201 && r.body.status === "pending", JSON.stringify(r.body));
r = await guest("POST", `/api/public/tables/${tables[0].qr_token}/rounds`, { idempotencyKey: key, items: [{ menuItemId: d1.id, quantity: 2 }] });
check("gửi trùng key → duplicate", r.status === 200 && r.body.duplicate === true);
check("chưa có phiên khi chưa xác nhận", (await db.query("SELECT count(*)::int c FROM table_sessions")).rows[0].c === 0);

console.log("5. Nhân viên xác nhận → mở phiên → bếp");
r = await staff("GET", "/api/staff/board");
const waiting = r.body.waitingRounds?.find((w) => w.table_id === tables[0].id);
check("bảng bàn có lượt chờ", Boolean(waiting), JSON.stringify(r.body).slice(0, 200));
r = await staff("POST", `/api/staff/rounds/${waiting.id}`, { action: "confirm" });
const sessionId = r.body.sessionId;
check("xác nhận → tạo phiên", r.status === 200 && Boolean(sessionId), JSON.stringify(r.body));
r = await guest2("GET", `/api/public/tables/${tables[0].qr_token}`);
check("máy thứ 2 quét QR → vào thẳng phiên", r.body.session?.active === true && r.body.items.length === 2);
check("nhãn 'món đã gọi' = 2 phần món 1", r.body.badges[d1.id] === 2, JSON.stringify(r.body.badges));
r = await kitchen("GET", "/api/staff/kitchen");
check("bếp thấy 2 món chờ", r.body.items?.length === 2);
for (const item of r.body.items) {
  await kitchen("POST", `/api/staff/items/${item.id}`, { action: "start" });
  const done = await kitchen("POST", `/api/staff/items/${item.id}`, { action: "ready" });
  check(`bếp làm xong ${item.name}`, done.status === 200, JSON.stringify(done.body));
}
r = await staff("POST", `/api/staff/items/${r.body.items[0].id}`, { action: "serve" });
check("staff không có vai trò chạy bàn → 403", r.status === 403);

console.log("6. Thu ngân");
r = await staff("POST", `/api/staff/sessions/${sessionId}/bill`);
check("lập phiếu tạm tính", r.status === 200 && /PHIẾU TẠM TÍNH/.test(r.body.text), JSON.stringify(r.body).slice(0, 200));
const billId = r.body.billId, total = r.body.total;
r = await staff("POST", `/api/staff/bills/${billId}/payments`, { method: "cash", cashReceived: total + 50000, pin: "000000" });
check("thu tiền sai PIN → 400", r.status === 400 && /PIN/.test(r.body.error));
r = await staff("POST", `/api/staff/bills/${billId}/payments`, { method: "bank_transfer" });
check("chuyển khoản → VietQR", r.status === 201 && r.body.vietqr?.payload?.startsWith("000201"), JSON.stringify(r.body).slice(0, 200));
const transferId = r.body.payment.id;
r = await staff("POST", `/api/staff/bills/${billId}/issue`, { pin: "246813" });
check("phát hành khi chưa nhận tiền → chặn", r.status === 409, JSON.stringify(r.body));
r = await staff("POST", `/api/staff/payments/${transferId}`, { action: "cancel", reason: "Khách trả tiền mặt", pin: "246813" });
check("huỷ khoản chuyển khoản", r.status === 200, JSON.stringify(r.body));
r = await staff("POST", `/api/staff/bills/${billId}/payments`, { method: "cash", cashReceived: total + 50000, pin: "246813" });
check("thu tiền mặt, tiền thối 50.000", r.status === 201 && r.body.payment.change_given === 50000, JSON.stringify(r.body));
r = await staff("POST", `/api/staff/bills/${billId}/issue`, { pin: "246813" });
check("phát hành khi còn món chưa phục vụ → chặn", r.status === 409 && /phục vụ/.test(r.body.error), JSON.stringify(r.body));
const sess = (await owner("GET", `/api/staff/sessions/${sessionId}`)).body;
for (const item of sess.items) await owner("POST", `/api/staff/items/${item.id}`, { action: "serve" });
r = await staff("POST", `/api/staff/bills/${billId}/issue`, { pin: "246813", buyer: { company: "Công ty ABC", taxCode: "0311111111" } });
check("phát hành phiếu → số PTT-0000001", r.status === 200 && r.body.number === "PTT-0000001", JSON.stringify(r.body).slice(0, 300));
check("phiếu có tiền bằng chữ + người mua", /Bằng chữ/.test(r.body.text) && /Công ty ABC/.test(r.body.text));
check("phiên đã đóng, bàn trống", (await db.query("SELECT status FROM table_sessions WHERE id=$1", [sessionId])).rows[0].status === "closed");
r = await guest("GET", `/api/public/tables/${tables[0].qr_token}/bill`);
check("khách xem phiếu thanh toán", r.status === 200 && r.body.title === "PHIẾU THANH TOÁN");

console.log("7. PIN & khoá màn hình");
await staff("POST", "/api/auth/lock");
r = await staff("GET", "/api/staff/board");
check("khoá màn hình → 423", r.status === 423 && r.body.code === "pin_required");
r = await staff("POST", "/api/auth/pin", { pin: "999999" });
check("sai PIN → 400", r.status === 400);
r = await staff("POST", "/api/auth/pin", { pin: "246813" });
check("đúng PIN → mở khoá", r.status === 200);

console.log("8. Order rác, chuyển bàn, đóng bất thường");
await guest("POST", `/api/public/tables/${tables[1].qr_token}/rounds`, { idempotencyKey: randomUUID(), items: [{ menuItemId: d1.id, quantity: 1 }] });
await db.query("UPDATE order_rounds SET created_at = now() - interval '11 minutes' WHERE status='pending'");
r = await staff("GET", "/api/staff/board");
const junk = r.body.waitingRounds.find((w) => w.status === "junk");
check("quá 10 phút → order rác", Boolean(junk));
r = await staff("POST", `/api/staff/rounds/${junk.id}`, { action: "confirm" });
const s2 = r.body.sessionId;
check("khôi phục order rác → mở phiên", r.status === 200 && Boolean(s2));
r = await staff("POST", `/api/staff/sessions/${s2}/transfer`, { tableId: tables[0].id });
check("chuyển bàn sang bàn trống", r.status === 200, JSON.stringify(r.body));
r = await staff("POST", `/api/staff/sessions/${s2}/abnormal`, { reason: "", pin: "246813" });
check("đóng bất thường thiếu lý do → 400", r.status === 400);
r = await staff("POST", `/api/staff/sessions/${s2}/abnormal`, { reason: "Khách bỏ về", pin: "246813" });
check("đóng bất thường → chờ owner duyệt", r.status === 200);
const approval = (await db.query("SELECT id FROM approvals WHERE session_id=$1", [s2])).rows[0];
r = await staff("POST", `/api/admin/approvals/${approval.id}`, { decision: "approved" });
check("nhân viên tự duyệt → 403", r.status === 403);
r = await owner("POST", `/api/admin/approvals/${approval.id}`, { decision: "approved" });
check("owner duyệt → ghi thất thoát", r.status === 200 && (await db.query("SELECT status FROM table_sessions WHERE id=$1", [s2])).rows[0].status === "abnormal_closed");

console.log("9. Log");
r = await owner("GET", "/api/admin/audit");
check("xem log cần OTP → 403 otp_required", r.status === 403 && r.body.code === "otp_required");
const chain = (await db.query("SELECT audit_verify_chain() AS bad, count(*) FILTER (WHERE category='customer') AS cust, count(*) AS total FROM audit_log")).rows[0];
check(`chuỗi log toàn vẹn (${chain.total} dòng, ${chain.cust} của khách)`, chain.bad === null && Number(chain.cust) > 0);
const served = (await db.query("SELECT count(*)::int c FROM audit_log WHERE action='item.serve' AND actor_label='owner.test' AND role_context='runner'")).rows[0].c;
check("log ghi đúng người + vai trò lúc thao tác (owner bưng món = runner)", served === 2, String(served));

console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
await db.end();
process.exitCode = fail ? 1 : 0;
