/**
 * Kiểm chứng các luật nghiệp vụ mà DATABASE tự chặn (docs/DATABASE_DESIGN.md mục 7).
 * Mỗi test chạy trong transaction rồi ROLLBACK: không để lại dữ liệu.
 *
 *   npm run db:test                         # mặc định database tenant_demo
 *   TENANT_TEST_DATABASE_URL=... npm run db:test
 *
 * Yêu cầu: database quán đã migrate, có 1 owner, >= 2 bàn, >= 3 món (tạo bằng `npm run tenant:create -- ... --demo`).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.TENANT_TEST_DATABASE_URL ?? "postgresql://saas_app:saas_app_dev@localhost:5432/tenant_demo" });
const q = (sql, params) => c.query(sql, params);
let pass = 0, fail = 0;
async function t(name, shouldPass, fn) {
  await q("BEGIN");
  try {
    await fn();
    if (shouldPass) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, "— KHÔNG bị chặn"); }
  } catch (e) {
    if (shouldPass) { fail++; console.log("  ✗", name, "—", e.message); } else { pass++; console.log("  ✓", name, "→ chặn:", e.message.slice(0, 90)); }
  }
  finally { await q("ROLLBACK"); }
}
const one = async (sql, p) => (await q(sql, p)).rows[0];
async function staff(username, type, roles) {
  return (await one(`INSERT INTO accounts (username, full_name, account_type, roles, password_hash) VALUES ($1,$1,$2,$3,'x') RETURNING id`, [username, type, roles])).id;
}
async function fx() {
  const owner = (await one("SELECT id FROM accounts WHERE account_type='owner'")).id;
  const s = await staff("nv" + randomUUID().slice(0, 8), "staff", ["order", "cashier"]);
  const tables = (await q("SELECT id FROM dining_tables ORDER BY sort_order LIMIT 2")).rows.map(r => r.id);
  const items = (await q("SELECT id, name, price FROM menu_items ORDER BY sort_order LIMIT 3")).rows;
  const session = (await one("INSERT INTO table_sessions (opened_by) VALUES ($1) RETURNING id", [s])).id;
  await q("INSERT INTO session_tables (session_id, table_id, attached_by) VALUES ($1,$2,$3)", [session, tables[0], s]);
  const round = (await one(`INSERT INTO order_rounds (session_id, source, status, idempotency_key, created_by, confirmed_at, confirmed_by)
     VALUES ($1,'staff','confirmed',$2,$3,now(),$3) RETURNING id`, [session, randomUUID(), s])).id;
  const it = items[0];
  const item = (await one(`INSERT INTO order_items (round_id, session_id, menu_item_id, name, unit, unit_price, quantity, line_total, status)
     VALUES ($1,$2,$3,$4,'phần',$5,2,$6,'queued') RETURNING id`, [round, session, it.id, it.name, it.price, it.price * 2])).id;
  return { owner, s, tables, items, session, round, item, price: it.price };
}
async function serve(f, id = f.item) {
  await q("UPDATE order_items SET status='cooking', cooking_by=$2 WHERE id=$1", [id, f.s]);
  await q("UPDATE order_items SET status='ready', ready_by=$2 WHERE id=$1", [id, f.s]);
  await q("UPDATE order_items SET status='served', served_at=now(), served_by=$2 WHERE id=$1", [id, f.s]);
}
async function bill(f, { pay = true, issue = true } = {}) {
  const total = f.price * 2;
  const b = (await one("INSERT INTO bills (session_id, created_by, subtotal, total) VALUES ($1,$2,$3,$3) RETURNING id", [f.session, f.s, total])).id;
  await q(`INSERT INTO bill_lines (bill_id, line_no, order_item_id, name, unit, quantity, unit_price, line_total) VALUES ($1,1,$2,'x','phần',2,$3,$4)`, [b, f.item, f.price, total]);
  if (pay) {
    const p = (await one("INSERT INTO payments (bill_id, method, amount, cash_received, created_by) VALUES ($1,'cash',$2,$3,$4) RETURNING id", [b, total, total + 22000, f.s])).id;
    await q("UPDATE payments SET status='confirmed', confirmed_at=now(), confirmed_by=$2 WHERE id=$1", [p, f.s]);
  }
  if (issue) await q("UPDATE bills SET status='issued', issued_by=$2, total_in_words='x' WHERE id=$1", [b, f.s]);
  return b;
}

(async () => {
  await c.connect();
  console.log("Tài khoản & vai trò");
  await t("owner thứ 2", false, () => staff("owner2", "owner", []));
  await t("staff order+cashier", true, () => staff("a.b", "staff", ["order", "cashier"]));
  await t("staff order+kitchen", false, () => staff("a.b", "staff", ["order", "kitchen"]));
  await t("staff 3 vai trò", false, () => staff("a.b", "staff", ["order", "runner", "cashier"]));
  await t("staff vai trò trùng {order,order}", false, () => staff("a.b", "staff", ["order", "order"]));
  await t("tài khoản bếp thứ 2", false, async () => { await staff("bep1", "kitchen", ["kitchen"]); await staff("bep2", "kitchen", ["kitchen"]); });
  await t("quản lý thứ 3", false, async () => { await staff("ql1", "manager", []); await staff("ql2", "manager", []); await staff("ql3", "manager", []); });
  await t("username có dấu/khoảng trắng", false, () => staff("Hồ Dũng", "staff", ["order"]));
  await t("username trùng", false, async () => { await staff("hxdung", "staff", ["order"]); await staff("hxdung", "staff", ["runner"]); });
  await t("bỏ cờ đổi mật khẩu khi chưa đặt PIN", false, async () => { const id = await staff("x.y", "staff", ["order"]); await q("UPDATE accounts SET must_change_password=false WHERE id=$1", [id]); });
  await t("khoá tài khoản owner", false, () => q("UPDATE accounts SET is_active=false, deactivated_at=now() WHERE account_type='owner'"));
  await t("xoá cứng tài khoản", false, async () => { const id = await staff("x.y", "staff", ["order"]); await q("DELETE FROM accounts WHERE id=$1", [id]); });

  console.log("Phiên bàn");
  await t("mở phiên thứ 2 trên cùng bàn", false, async () => { const f = await fx(); const s2 = (await one("INSERT INTO table_sessions (opened_by) VALUES ($1) RETURNING id", [f.s])).id; await q("INSERT INTO session_tables (session_id, table_id, attached_by) VALUES ($1,$2,$3)", [s2, f.tables[0], f.s]); });
  await t("đóng phiên khi chưa có phiếu", false, async () => { const f = await fx(); await q("UPDATE table_sessions SET status='closed', closed_at=now(), closed_by=$2 WHERE id=$1", [f.session, f.s]); });
  await t("đóng bất thường thiếu lý do", false, async () => { const f = await fx(); await q("UPDATE table_sessions SET status='abnormal_pending', closed_at=now(), closed_by=$2 WHERE id=$1", [f.session, f.s]); });
  await t("đóng bất thường có lý do → bàn trống ngay, mở phiên mới được", true, async () => {
    const f = await fx();
    await q("UPDATE table_sessions SET status='abnormal_pending', closed_at=now(), closed_by=$2, abnormal_reason='Khách bỏ về' WHERE id=$1", [f.session, f.s]);
    const s2 = (await one("INSERT INTO table_sessions (opened_by) VALUES ($1) RETURNING id", [f.s])).id;
    await q("INSERT INTO session_tables (session_id, table_id, attached_by) VALUES ($1,$2,$3)", [s2, f.tables[0], f.s]); });
  await t("nhân viên duyệt đóng bất thường", false, async () => {
    const f = await fx();
    await q("UPDATE table_sessions SET status='abnormal_pending', closed_at=now(), closed_by=$2, abnormal_reason='Khách bỏ về' WHERE id=$1", [f.session, f.s]);
    const a = (await one("INSERT INTO approvals (approval_type, session_id, reason, requested_by, amount) VALUES ('abnormal_close',$1,'Khách bỏ về',$2,178000) RETURNING id", [f.session, f.s])).id;
    await q("UPDATE approvals SET status='approved', decided_by=$2, decided_at=now() WHERE id=$1", [a, f.s]); });
  await t("owner duyệt đóng bất thường", true, async () => {
    const f = await fx();
    await q("UPDATE table_sessions SET status='abnormal_pending', closed_at=now(), closed_by=$2, abnormal_reason='Khách bỏ về' WHERE id=$1", [f.session, f.s]);
    const a = (await one("INSERT INTO approvals (approval_type, session_id, reason, requested_by, amount) VALUES ('abnormal_close',$1,'Khách bỏ về',$2,178000) RETURNING id", [f.session, f.s])).id;
    await q("UPDATE approvals SET status='approved', decided_by=$2, decided_at=now() WHERE id=$1", [a, f.owner]);
    await q("UPDATE table_sessions SET status='abnormal_closed' WHERE id=$1", [f.session]); });
  await t("mở lại phiên đã đóng", false, async () => { const f = await fx(); await serve(f); await bill(f); await q("UPDATE table_sessions SET status='closed', closed_at=now(), closed_by=$2 WHERE id=$1", [f.session, f.s]); await q("UPDATE table_sessions SET status='open', closed_at=null WHERE id=$1", [f.session]); });
  await t("chuyển bàn (tháo bàn 1, gắn bàn 2)", true, async () => { const f = await fx(); await q("UPDATE session_tables SET detached_at=now(), detached_by=$2 WHERE session_id=$1", [f.session, f.s]); await q("INSERT INTO session_tables (session_id, table_id, reason, attached_by) VALUES ($1,$2,'transfer',$3)", [f.session, f.tables[1], f.s]); });

  console.log("Lượt gọi & món");
  await t("lượt khách không có thiết bị", false, async () => { const f = await fx(); await q("INSERT INTO order_rounds (table_id, source, idempotency_key) VALUES ($1,'customer',$2)", [f.tables[1], randomUUID()]); });
  await t("lượt khách chờ xác nhận khi bàn chưa có phiên", true, async () => { const f = await fx(); await q("INSERT INTO order_rounds (table_id, source, idempotency_key, customer_device_key_hash) VALUES ($1,'customer',$2,'dev1')", [f.tables[1], randomUUID()]); });
  await t("xác nhận lượt mà không gắn phiên", false, async () => { const f = await fx(); const r = (await one("INSERT INTO order_rounds (table_id, source, idempotency_key, customer_device_key_hash) VALUES ($1,'customer',$2,'dev1') RETURNING id", [f.tables[1], randomUUID()])).id; await q("UPDATE order_rounds SET status='confirmed', confirmed_at=now(), confirmed_by=$2 WHERE id=$1", [r, f.s]); });
  await t("order rác → khôi phục", true, async () => { const f = await fx(); const r = (await one("INSERT INTO order_rounds (table_id, source, idempotency_key, customer_device_key_hash) VALUES ($1,'customer',$2,'dev1') RETURNING id", [f.tables[0], randomUUID()])).id; await q("UPDATE order_rounds SET status='junk', junk_at=now() WHERE id=$1", [r]); await q("UPDATE order_rounds SET status='confirmed', session_id=$2, confirmed_at=now(), confirmed_by=$3, restored_at=now(), restored_by=$3 WHERE id=$1", [r, f.session, f.s]); });
  await t("lượt bị từ chối rồi xác nhận lại", false, async () => { const f = await fx(); const r = (await one("INSERT INTO order_rounds (table_id, source, idempotency_key, customer_device_key_hash) VALUES ($1,'customer',$2,'dev1') RETURNING id", [f.tables[1], randomUUID()])).id; await q("UPDATE order_rounds SET status='rejected', rejected_at=now(), rejected_by=$2 WHERE id=$1", [r, f.s]); await q("UPDATE order_rounds SET status='confirmed', session_id=$2, confirmed_at=now(), confirmed_by=$3 WHERE id=$1", [r, f.session, f.s]); });
  await t("món: chờ bếp → đã phục vụ (bỏ qua bếp)", false, async () => { const f = await fx(); await q("UPDATE order_items SET status='served', served_at=now(), served_by=$2 WHERE id=$1", [f.item, f.s]); });
  await t("món: chờ bếp → đang làm → xong → đã phục vụ", true, async () => { const f = await fx(); await serve(f); });
  await t("huỷ món đã phục vụ", false, async () => { const f = await fx(); await serve(f); await q("UPDATE order_items SET status='cancelled', cancel_stage='after_cook', cancel_reason='x', cancelled_at=now(), cancelled_by=$2 WHERE id=$1", [f.item, f.s]); });
  await t("huỷ món đang nấu không có lý do", false, async () => { const f = await fx(); await q("UPDATE order_items SET status='cooking' WHERE id=$1", [f.item]); await q("UPDATE order_items SET status='cancelled', cancel_stage='after_cook', cancelled_at=now(), cancelled_by=$2 WHERE id=$1", [f.item, f.s]); });
  await t("huỷ món đang nấu dạng before_cook", false, async () => { const f = await fx(); await q("UPDATE order_items SET status='cooking' WHERE id=$1", [f.item]); await q("UPDATE order_items SET status='cancelled', cancel_stage='before_cook', cancelled_at=now(), cancelled_by=$2 WHERE id=$1", [f.item, f.s]); });
  await t("huỷ món chưa nấu (tự do)", true, async () => { const f = await fx(); await q("UPDATE order_items SET status='cancelled', cancel_stage='before_cook', cancelled_at=now(), cancelled_by=$2 WHERE id=$1", [f.item, f.s]); });
  await t("sửa giá món đã gửi bếp", false, async () => { const f = await fx(); await q("UPDATE order_items SET unit_price=1, line_total=2 WHERE id=$1", [f.item]); });
  await t("line_total sai", false, async () => { const f = await fx(); await q("INSERT INTO order_items (round_id, session_id, menu_item_id, name, unit, unit_price, quantity, line_total, status) VALUES ($1,$2,$3,'x','phần',1000,2,1999,'queued')", [f.round, f.session, f.items[0].id]); });
  await t("nhãn 'món đã gọi' mất khi đã phục vụ", true, async () => { const f = await fx(); const before = (await q("SELECT * FROM session_ordered_badges WHERE session_id=$1", [f.session])).rows; await serve(f); const after = (await q("SELECT * FROM session_ordered_badges WHERE session_id=$1", [f.session])).rows; if (before[0]?.unserved_quantity !== 2 || after.length !== 0) throw new Error(`badge sai: ${JSON.stringify(before)} → ${JSON.stringify(after)}`); });

  console.log("Phiếu thanh toán");
  await t("phát hành khi còn món chưa phục vụ", false, async () => { const f = await fx(); await bill(f); });
  await t("phát hành khi chưa thu đủ tiền", false, async () => { const f = await fx(); await serve(f); await bill(f, { pay: false }); });
  await t("phát hành đúng → số 1, 2 liên tục; đóng phiên được", true, async () => {
    const f = await fx(); await serve(f); const b1 = await bill(f);
    await q("UPDATE table_sessions SET status='closed', closed_at=now(), closed_by=$2 WHERE id=$1", [f.session, f.s]);
    const g = await fx(); await serve(g); const b2 = await bill(g);
    const nums = (await q("SELECT number, seller_name FROM bills WHERE id = ANY($1) ORDER BY number", [[b1, b2]])).rows;
    if (nums.map(n => Number(n.number)).join() !== "1,2" || !nums[0].seller_name) throw new Error(JSON.stringify(nums)); });
  await t("sửa phiếu đã phát hành", false, async () => { const f = await fx(); await serve(f); const b = await bill(f); await q("UPDATE bills SET note='sửa' WHERE id=$1", [b]); });
  await t("xoá phiếu", false, async () => { const f = await fx(); await serve(f); const b = await bill(f); await q("DELETE FROM bills WHERE id=$1", [b]); });
  await t("thêm dòng vào phiếu đã phát hành", false, async () => { const f = await fx(); await serve(f); const b = await bill(f); await q("INSERT INTO bill_lines (bill_id, line_no, name, unit, quantity, unit_price, line_total) VALUES ($1,2,'x','phần',1,1,1)", [b]); });
  await t("phiếu thứ 2 (tách bill) cho cùng phiên", false, async () => { const f = await fx(); await q("INSERT INTO bills (session_id, created_by) VALUES ($1,$2)", [f.session, f.s]); await q("INSERT INTO bills (session_id, created_by) VALUES ($1,$2)", [f.session, f.s]); });
  await t("sửa số tiền khoản thanh toán đã xác nhận", false, async () => { const f = await fx(); await serve(f); await bill(f, { issue: false }); await q("UPDATE payments SET amount=1"); });
  await t("phiếu điều chỉnh cần lý do", false, async () => { const f = await fx(); await serve(f); const b = await bill(f); await q("INSERT INTO bills (session_id, kind, original_bill_id, created_by) VALUES ($1,'adjustment',$2,$3)", [f.session, b, f.s]); });
  await t("phiếu điều chỉnh âm có lý do", true, async () => { const f = await fx(); await serve(f); const b = await bill(f);
    const adj = (await one("INSERT INTO bills (session_id, kind, original_bill_id, adjustment_reason, created_by, subtotal, total) VALUES ($1,'adjustment',$2,'Tính nhầm 1 phần',$3,$4,$4) RETURNING id", [f.session, b, f.s, -f.price])).id;
    await q("INSERT INTO bill_lines (bill_id, line_no, name, unit, quantity, unit_price, line_total) VALUES ($1,1,'x','phần',-1,$2,$3)", [adj, f.price, -f.price]);
    await q("UPDATE bills SET status='issued', issued_by=$2, total_in_words='x' WHERE id=$1", [adj, f.owner]); });

  console.log("Kho nguyên liệu (ví dụ của chủ sản phẩm)");
  await t("số phần A=5,B=10,C=2 → bán 1 phần A → A=4,B=8,C=2", true, async () => {
    const f = await fx(); const [A, B, C] = f.items.map(i => i.id);
    const ing = async (name, tracked) => (await one("INSERT INTO ingredients (name, is_tracked) VALUES ($1,$2) RETURNING id", [name, tracked])).id;
    const thit = await ing("Thịt", true), rau = await ing("Rau", true), hanh = await ing("Hành lá", false), toi = await ing("Tỏi", false);
    const rl = (m, i, qn) => q("INSERT INTO recipe_lines VALUES ($1,$2,$3)", [m, i, qn]);
    await rl(A, thit, 200); await rl(A, hanh, 2); await rl(A, toi, 1);
    await rl(B, thit, 100); await rl(B, toi, 3); await rl(B, rau, 1);
    await rl(C, thit, 400); await rl(C, rau, 20);
    await q("INSERT INTO stock_movements (ingredient_id, movement_type, quantity, created_by) VALUES ($1,'purchase',1000,$3),($2,'purchase',40,$3)", [thit, rau, f.owner]);
    const portions = async () => Object.fromEntries((await q("SELECT menu_item_id, max_portions FROM menu_item_portions")).rows.map(r => [r.menu_item_id, r.max_portions]));
    const p1 = await portions();
    await q("INSERT INTO stock_movements (ingredient_id, movement_type, quantity, order_item_id) VALUES ($1,'consume',-200,$2)", [thit, f.item]);
    const p2 = await portions();
    const got = `${p1[A]},${p1[B]},${p1[C]} → ${p2[A]},${p2[B]},${p2[C]}`;
    console.log("     ", got);
    if (got !== "5,10,2 → 4,8,2") throw new Error(got); });
  await t("sửa sổ kho", false, async () => { const f = await fx(); const i = (await one("INSERT INTO ingredients (name) VALUES ('Cá') RETURNING id")).id; await q("INSERT INTO stock_movements (ingredient_id, movement_type, quantity, created_by) VALUES ($1,'purchase',10,$2)", [i, f.owner]); await q("UPDATE stock_movements SET quantity=99"); });
  await t("nhập kho số âm", false, async () => { const f = await fx(); const i = (await one("INSERT INTO ingredients (name) VALUES ('Cá') RETURNING id")).id; await q("INSERT INTO stock_movements (ingredient_id, movement_type, quantity, created_by) VALUES ($1,'purchase',-10,$2)", [i, f.owner]); });

  console.log("Log audit");
  const log = (action) => q("INSERT INTO audit_log (category, actor_type, actor_label, action) VALUES ('shop','system','system',$1)", [action]);
  await t("ghi 3 dòng → chuỗi băm toàn vẹn", true, async () => { await log("test.one"); await log("test.two"); await log("test.three"); const v = await one("SELECT audit_verify_chain() AS bad"); if (v.bad !== null) throw new Error("chuỗi hỏng tại " + v.bad); });
  await t("UPDATE log", false, () => q("UPDATE audit_log SET reason='x'"));
  await t("DELETE log", false, () => q("DELETE FROM audit_log"));
  await t("TRUNCATE log", false, () => q("TRUNCATE audit_log"));
  await t("DELETE log khi bật purge nhưng chưa quá hạn", false, async () => { await q("SET LOCAL app.audit_purge = 'on'"); await q("DELETE FROM audit_log"); });
  await t("superuser tắt trigger rồi sửa log → audit_verify_chain phát hiện", true, async () => {
    await log("test.one"); await log("test.two");
    await q("ALTER TABLE audit_log DISABLE TRIGGER audit_log_immutable");
    const target = (await one("SELECT min(id) AS id FROM audit_log")).id;
    await q("UPDATE audit_log SET actor_label='kẻ gian' WHERE id=$1", [target]);
    const v = await one("SELECT audit_verify_chain() AS bad");
    if (String(v.bad) !== String(target)) throw new Error("không phát hiện, bad=" + v.bad); });

  console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
  await c.end();
  process.exitCode = fail ? 1 : 0;
})().catch(async (e) => { console.error(e); await c.end(); process.exitCode = 1; });
