"use client";

import { faBan, faBuilding, faCheck, faEnvelope, faMoneyBill, faPrint, faQrcode, faReceipt, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/components/ui/api";
import { ui } from "@/components/ui/styles";
import { formatPrice } from "@/lib/format";
import { buildVietQrPayload } from "@/lib/vietqr";
import type { PinResult } from "./PinConfirm";
import type { Payment, SessionDetail } from "./types";

type Ask = (request: { title: string; description: string; reasonLabel?: string }) => Promise<PinResult | null>;

function TransferQr({ bank, payment }: { bank: NonNullable<SessionDetail["bank"]>; payment: Payment }) {
    const [src, setSrc] = useState("");
    useEffect(() => {
        const payload = buildVietQrPayload({ bankBin: bank.bin, accountNo: bank.accountNo, amount: payment.amount, content: payment.transfer_content ?? "" });
        QRCode.toDataURL(payload, { width: 360, margin: 1, errorCorrectionLevel: "M" }).then(setSrc);
    }, [bank, payment]);
    return (
        <div className="grid justify-items-center gap-2 rounded-xl border border-[#eee3d7] p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- mã VietQR sinh tại trình duyệt (data URL) */}
            {src ? <img src={src} alt={`Mã VietQR chuyển khoản ${formatPrice(payment.amount)}`} className="size-56" /> : <div className="size-56 bg-[#f7f3ed]" />}
            <p className="text-lg font-bold text-[#b84d1d]">{formatPrice(payment.amount)}</p>
            <p className="text-xs text-[#806d62]">{bank.accountName ?? ""} · STK {bank.accountNo}<br />Nội dung: <b>{payment.transfer_content}</b></p>
            <p className="text-xs text-[#806d62]">Mô phỏng: chưa nối cổng thanh toán — kiểm tra tài khoản rồi bấm “Đã nhận tiền”.</p>
        </div>
    );
}

/** Vai trò Thu ngân: phiếu tạm tính → thu tiền (tiền mặt / VietQR) → phát hành phiếu (PIN) → đóng bàn. */
export default function CashierPanel({ detail, reload, ask, onIssued, onAbnormal }: {
    detail: SessionDetail;
    reload: () => Promise<void>;
    ask: Ask;
    onIssued: () => void;
    onAbnormal: () => void;
}) {
    const [receiptHtml, setReceiptHtml] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [cashReceived, setCashReceived] = useState("");
    const [buyer, setBuyer] = useState({ name: "", company: "", taxCode: "", address: "", email: "" });
    const [emailTo, setEmailTo] = useState("");
    const [notice, setNotice] = useState("");

    const bill = detail.bill;
    const unserved = detail.items.filter((item) => ["pending", "queued", "cooking", "ready"].includes(item.status)).length;
    const confirmed = bill?.payments.filter((payment) => payment.status === "confirmed").reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
    const pending = bill?.payments.filter((payment) => payment.status === "pending") ?? [];
    const due = bill ? bill.total - confirmed - pending.reduce((sum, payment) => sum + payment.amount, 0) : 0;

    useEffect(() => {
        if (!bill) return;
        api<{ html: string }>(`/api/staff/sessions/${detail.session.id}/bill`).then((data) => setReceiptHtml(data.html)).catch(() => {});
    }, [bill, detail.session.id]);

    async function run(action: () => Promise<void>) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await action();
            await reload();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    const refreshBill = () => run(async () => {
        const data = await api<{ html: string }>(`/api/staff/sessions/${detail.session.id}/bill`, { method: "POST" });
        setReceiptHtml(data.html);
    });

    const payCash = () => run(async () => {
        const result = await ask({ title: "Thu tiền mặt", description: `Thu ${formatPrice(due)} — khách đưa ${formatPrice(Number(cashReceived || due))}.` });
        if (!result) return;
        await api(`/api/staff/bills/${bill!.id}/payments`, { body: { method: "cash", cashReceived: Number(cashReceived || due), pin: result.pin } });
        setCashReceived("");
    });

    const payTransfer = () => run(async () => {
        await api(`/api/staff/bills/${bill!.id}/payments`, { body: { method: "bank_transfer" } });
    });

    const settle = (payment: Payment, action: "confirm" | "cancel") => run(async () => {
        const result = await ask(action === "confirm"
            ? { title: "Xác nhận đã nhận chuyển khoản", description: `Chỉ xác nhận khi tài khoản đã nhận ${formatPrice(payment.amount)} với nội dung ${payment.transfer_content}.` }
            : { title: "Huỷ khoản chuyển khoản", description: "Huỷ khoản chờ để đổi sang hình thức khác.", reasonLabel: "Lý do huỷ" });
        if (!result) return;
        await api(`/api/staff/payments/${payment.id}`, { body: { action, pin: result.pin, reason: result.reason || null } });
    });

    const issue = () => run(async () => {
        const result = await ask({ title: "Xác nhận thanh toán lần cuối", description: `Phát hành phiếu ${formatPrice(bill!.total)} và đóng bàn ${detail.session.table_names ?? ""}. Phiếu đã phát hành không sửa được.` });
        if (!result) return;
        const data = await api<{ html: string }>(`/api/staff/bills/${bill!.id}/issue`, { body: { pin: result.pin, buyer } });
        setReceiptHtml(data.html);
        onIssued();
    });

    const abnormal = () => run(async () => {
        const result = await ask({ title: "Đóng phiên bất thường", description: "Dùng khi khách bỏ về không thanh toán. Bàn trống ngay; owner duyệt để ghi nhận thất thoát.", reasonLabel: "Lý do (bắt buộc)" });
        if (!result) return;
        await api(`/api/staff/sessions/${detail.session.id}/abnormal`, { body: { pin: result.pin, reason: result.reason } });
        onAbnormal();
    });

    const sendEmail = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void run(async () => {
            await api(`/api/staff/bills/${bill!.id}/email`, { body: { email: emailTo } });
            setNotice(`Đã gửi phiếu tới ${emailTo}.`);
        });
    };

    const quickCash = [due, ...[50_000, 100_000, 200_000, 500_000].map((step) => Math.ceil(due / step) * step)]
        .filter((value, index, list) => value > 0 && list.indexOf(value) === index).slice(0, 4);

    return (
        <div className="grid gap-4">
            {error && <p role="alert" className={ui.error}>{error}</p>}
            {notice && <p role="status" className={ui.success}>{notice}</p>}
            {unserved > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Còn {unserved} món chưa phục vụ / chưa huỷ — chưa thể phát hành phiếu.</p>}

            {bill?.status !== "issued" && (
                <button type="button" onClick={refreshBill} disabled={busy} className={ui.secondary}>
                    <FontAwesomeIcon icon={faReceipt} /> {bill ? "Cập nhật phiếu tạm tính" : "Lập phiếu tạm tính"}
                </button>
            )}

            {receiptHtml && (
                <div className="overflow-x-auto rounded-2xl bg-[#efe8de] p-3" dangerouslySetInnerHTML={{ __html: receiptHtml }} />
            )}

            {bill?.status === "draft" && (
                <>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                        <div className={`${ui.card} p-2`}><p className="text-[#806d62]">Cần thu</p><b>{formatPrice(bill.total)}</b></div>
                        <div className={`${ui.card} p-2`}><p className="text-[#806d62]">Đã thu</p><b className="text-green-700">{formatPrice(confirmed)}</b></div>
                        <div className={`${ui.card} p-2`}><p className="text-[#806d62]">Còn lại</p><b className="text-[#b84d1d]">{formatPrice(Math.max(due, 0))}</b></div>
                    </div>

                    {pending.map((payment) => (
                        <div key={payment.id} className="grid gap-2">
                            {detail.bank && <TransferQr bank={detail.bank} payment={payment} />}
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => settle(payment, "confirm")} disabled={busy} className={ui.primary}><FontAwesomeIcon icon={faCheck} /> Đã nhận tiền</button>
                                <button type="button" onClick={() => settle(payment, "cancel")} disabled={busy} className={ui.secondary}><FontAwesomeIcon icon={faXmark} /> Huỷ</button>
                            </div>
                        </div>
                    ))}

                    {due > 0 && (
                        <section className={`${ui.card} grid gap-3 p-4`} aria-label="Thu tiền">
                            <label htmlFor="cash-received" className={ui.label}>Tiền mặt khách đưa</label>
                            <input id="cash-received" type="number" min={due} inputMode="numeric" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder={String(due)} className={ui.input} />
                            <div className="flex flex-wrap gap-2">
                                {quickCash.map((value) => <button key={value} type="button" onClick={() => setCashReceived(String(value))} className={ui.small}>{formatPrice(value)}</button>)}
                            </div>
                            {Number(cashReceived) > due && <p className="text-sm">Tiền thối: <b>{formatPrice(Number(cashReceived) - due)}</b></p>}
                            <div className="grid gap-2 sm:grid-cols-2">
                                <button type="button" onClick={payCash} disabled={busy || (cashReceived !== "" && Number(cashReceived) < due)} className={ui.primary}><FontAwesomeIcon icon={faMoneyBill} /> Thu tiền mặt</button>
                                <button type="button" onClick={payTransfer} disabled={busy || !detail.bank} className={ui.secondary} title={detail.bank ? undefined : "Owner chưa cấu hình tài khoản nhận tiền"}>
                                    <FontAwesomeIcon icon={faQrcode} /> Chuyển khoản (VietQR)
                                </button>
                            </div>
                        </section>
                    )}

                    <details className={`${ui.card} p-4`}>
                        <summary className="cursor-pointer font-semibold"><FontAwesomeIcon icon={faBuilding} /> Thông tin người mua (khách cần hoá đơn công ty)</summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {([["name", "Tên người mua"], ["company", "Tên đơn vị"], ["taxCode", "MST đơn vị"], ["email", "Email nhận phiếu"], ["address", "Địa chỉ đơn vị"]] as const).map(([key, label]) => (
                                <div key={key} className={key === "address" ? "sm:col-span-2" : undefined}>
                                    <label htmlFor={`buyer-${key}`} className={ui.label}>{label}</label>
                                    <input id={`buyer-${key}`} type={key === "email" ? "email" : "text"} inputMode={key === "taxCode" ? "numeric" : undefined}
                                        value={buyer[key]} onChange={(event) => setBuyer({ ...buyer, [key]: event.target.value })} className={ui.input} />
                                </div>
                            ))}
                        </div>
                    </details>

                    <button type="button" onClick={issue} disabled={busy || unserved > 0 || due !== 0 || pending.length > 0} className={`${ui.primary} min-h-14 w-full text-lg`}>
                        <FontAwesomeIcon icon={faCheck} /> Xác nhận thanh toán & đóng bàn
                    </button>
                </>
            )}

            {bill?.status === "issued" && (
                <section className="grid gap-3">
                    <button type="button" onClick={() => window.print()} className={ui.secondary}><FontAwesomeIcon icon={faPrint} /> In phiếu (khổ 80mm)</button>
                    <form onSubmit={sendEmail} className="flex gap-2">
                        <label htmlFor="receipt-email" className="sr-only">Email nhận phiếu</label>
                        <input id="receipt-email" type="email" required value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="Email khách nhận phiếu" className={`${ui.input} flex-1`} />
                        <button type="submit" disabled={busy} className={ui.primary}><FontAwesomeIcon icon={faEnvelope} /> Gửi</button>
                    </form>
                </section>
            )}

            {detail.session.status === "open" && (
                <button type="button" onClick={abnormal} disabled={busy} className={ui.danger}><FontAwesomeIcon icon={faBan} /> Đóng phiên bất thường (khách bỏ về)</button>
            )}
        </div>
    );
}
