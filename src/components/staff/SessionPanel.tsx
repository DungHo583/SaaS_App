"use client";

import {
    faArrowRightArrowLeft, faBellConcierge, faCashRegister, faCheck, faCodeMerge, faFlagCheckered, faMobileScreen,
    faPersonWalking, faRotateLeft, faUtensils, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/components/ui/api";
import { useSession } from "@/components/ui/PinGate";
import { ITEM_STATUS_STYLES, ui } from "@/components/ui/styles";
import { formatDateTime, formatPrice, ITEM_STATUS_LABELS } from "@/lib/format";
import CashierPanel from "./CashierPanel";
import MenuPicker, { type CartLine } from "./MenuPicker";
import { usePinConfirm } from "./PinConfirm";
import type { BoardSession, BoardTable, SessionDetail } from "./types";

type Role = "order" | "runner" | "cashier";
const ROLE_TABS: Array<{ role: Role; label: string; icon: typeof faUtensils }> = [
    { role: "order", label: "Gọi món", icon: faUtensils },
    { role: "runner", label: "Chạy bàn", icon: faPersonWalking },
    { role: "cashier", label: "Thu ngân", icon: faCashRegister },
];

/**
 * Thao tác trên 1 bàn / phiên. Nhân viên CHỌN VAI TRÒ trước khi làm (BUSINESS_PROCESS 3.2):
 * gọi món / xác nhận lượt của khách → Gọi món; bưng món → Chạy bàn; thanh toán → Thu ngân.
 */
export default function SessionPanel({ sessionId, table, freeTables, openSessions, onDone, onChanged }: {
    sessionId: string;
    table: BoardTable | null;
    freeTables: BoardTable[];
    openSessions: Array<BoardSession & { label: string }>;
    onDone: (lock: boolean) => void;
    onChanged: () => void;
}) {
    const { me } = useSession();
    const roles = ROLE_TABS.filter((tab) => me.capabilities.includes(tab.role));
    const [role, setRole] = useState<Role | null>(roles.length === 1 ? roles[0].role : null);
    const [detail, setDetail] = useState<SessionDetail | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [finished, setFinished] = useState<"issued" | "abnormal" | null>(null);
    const { ask, dialog } = usePinConfirm();

    const reload = useCallback(() => api<SessionDetail>(`/api/staff/sessions/${sessionId}`).then(
        (data) => setDetail(data),
        (err: unknown) => setError(errorMessage(err)),
    ), [sessionId]);

    useEffect(() => { void reload(); }, [reload]);

    const ordered = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const item of detail?.items ?? []) {
            if (["pending", "queued", "cooking", "ready"].includes(item.status)) counts[item.menu_item_id] = (counts[item.menu_item_id] ?? 0) + item.quantity;
        }
        return counts;
    }, [detail]);

    async function act(action: () => Promise<unknown>) {
        setBusy(true);
        setError("");
        try {
            await action();
            await reload();
            onChanged();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function submitRound(lines: CartLine[], idempotencyKey: string) {
        setError("");
        try {
            await api(`/api/staff/sessions/${sessionId}/rounds`, { body: { items: lines, idempotencyKey } });
            await reload();
            onChanged();
            return true;
        } catch (err) {
            setError(errorMessage(err));
            return false;
        }
    }

    if (!detail) return <p className="py-10 text-center text-[#806d62]">{error || "Đang tải..."}</p>;
    const isOpen = detail.session.status === "open";
    const activeItems = detail.items.filter((item) => item.status !== "cancelled");

    return (
        <div className="grid gap-4">
            {dialog}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#806d62]">
                <span>{detail.session.order_type === "dine_in" ? detail.session.table_names ?? table?.name : detail.session.order_type === "takeaway" ? "Mang về" : "Đơn ship"} · mở lúc {formatDateTime(detail.session.opened_at)} bởi @{detail.session.opened_by}</span>
                <span className="font-bold text-[#b84d1d]">{formatPrice(activeItems.reduce((sum, item) => sum + item.line_total, 0))}</span>
            </div>
            {error && <p role="alert" className={ui.error}>{error}</p>}

            {finished ? (
                <p className={ui.success}>{finished === "issued" ? "Đã thanh toán và đóng bàn." : "Đã gửi yêu cầu đóng phiên bất thường cho owner duyệt. Bàn đã trống."}</p>
            ) : !isOpen ? (
                <p className={ui.error}>Phiên này đã đóng.</p>
            ) : (
                <div role="tablist" aria-label="Chọn vai trò thao tác" className="grid gap-2 sm:grid-cols-3">
                    {roles.map((tab) => (
                        <button key={tab.role} type="button" role="tab" aria-selected={role === tab.role} onClick={() => setRole(tab.role)}
                            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${role === tab.role ? "border-[#4a2d22] bg-[#4a2d22] text-white" : "border-[#eee3d7] bg-white"}`}>
                            <FontAwesomeIcon icon={tab.icon} /> {tab.label}
                        </button>
                    ))}
                </div>
            )}
            {isOpen && !role && !finished && <p className="text-center text-sm text-[#806d62]">Chọn vai trò cho thao tác này.</p>}

            {isOpen && role === "order" && (
                <>
                    {detail.pendingRounds.length > 0 && (
                        <section className="grid gap-2" aria-label="Lượt gọi của khách chờ xác nhận">
                            <h3 className="font-bold">Khách gọi, chờ xác nhận</h3>
                            {detail.pendingRounds.map((round) => (
                                <div key={round.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-sm">{round.items.map((item) => `${item.quantity}× ${item.name}${item.note ? ` (${item.note})` : ""}`).join(" · ")}</p>
                                    <p className="mb-2 text-xs text-[#806d62]">{formatDateTime(round.created_at)}{round.status === "junk" ? " · đã quá hạn (order rác)" : ""}</p>
                                    <div className="flex gap-2">
                                        <button type="button" disabled={busy} onClick={() => act(() => api(`/api/staff/rounds/${round.id}`, { body: { action: "confirm" } }))} className={ui.small}>
                                            <FontAwesomeIcon icon={round.status === "junk" ? faRotateLeft : faCheck} /> {round.status === "junk" ? "Khôi phục & gửi bếp" : "Xác nhận gửi bếp"}
                                        </button>
                                        {round.status === "pending" && (
                                            <button type="button" disabled={busy} onClick={() => act(() => api(`/api/staff/rounds/${round.id}`, { body: { action: "reject", reason: window.prompt("Lý do từ chối (không bắt buộc)") } }))} className={ui.danger}>
                                                <FontAwesomeIcon icon={faXmark} /> Từ chối
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}
                    <section aria-label="Gọi thêm món"><h3 className="mb-2 font-bold">Gọi món cho khách</h3><MenuPicker menu={detail.menu} ordered={ordered} onSubmit={submitRound} /></section>
                </>
            )}

            {(role === "order" || role === "runner" || finished) && detail.items.length > 0 && (
                <section aria-label="Món của bàn" className="grid gap-2">
                    <h3 className="font-bold">Món của bàn</h3>
                    <ul className="divide-y divide-[#eee3d7] rounded-xl border border-[#eee3d7]">
                        {detail.items.map((item) => (
                            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                                <span className="min-w-0">
                                    <b>{item.quantity}× {item.name}</b>{item.note && <span className="text-sm text-[#806d62]"> — {item.note}</span>}
                                    {item.cancel_reason && <span className="block text-xs text-red-700">Lý do huỷ: {item.cancel_reason}</span>}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className={`${ui.badge} ${ITEM_STATUS_STYLES[item.status]}`}>{ITEM_STATUS_LABELS[item.status]}</span>
                                    {isOpen && role === "runner" && item.status === "ready" && (
                                        <button type="button" disabled={busy} onClick={() => act(() => api(`/api/staff/items/${item.id}`, { body: { action: "serve" } }))} className={ui.small}>
                                            <FontAwesomeIcon icon={faBellConcierge} /> Đã phục vụ
                                        </button>
                                    )}
                                    {isOpen && role === "order" && item.status === "queued" && (
                                        <button type="button" disabled={busy} onClick={() => { if (confirm(`Huỷ ${item.quantity}× ${item.name}? (bếp chưa làm)`)) void act(() => api(`/api/staff/items/${item.id}`, { body: { action: "cancel" } })); }} className={ui.danger} aria-label={`Huỷ ${item.name}`}>
                                            <FontAwesomeIcon icon={faXmark} />
                                        </button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {isOpen && role === "order" && (
                <details className={`${ui.card} p-4`}>
                    <summary className="cursor-pointer font-semibold">Chuyển bàn · gộp bàn · thiết bị khách</summary>
                    <div className="mt-3 grid gap-3">
                        {detail.session.order_type === "dine_in" && (
                            <form className="flex gap-2" onSubmit={(event) => {
                                event.preventDefault();
                                const tableId = String(new FormData(event.currentTarget).get("tableId"));
                                void act(() => api(`/api/staff/sessions/${sessionId}/transfer`, { body: { tableId } }));
                            }}>
                                <label htmlFor="transfer-table" className="sr-only">Chuyển sang bàn</label>
                                <select id="transfer-table" name="tableId" required className={`${ui.input} flex-1`}>
                                    {freeTables.map((free) => <option key={free.id} value={free.id}>{free.name}</option>)}
                                </select>
                                <button type="submit" disabled={busy || freeTables.length === 0} className={ui.small}><FontAwesomeIcon icon={faArrowRightArrowLeft} /> Chuyển bàn</button>
                            </form>
                        )}
                        <form className="flex gap-2" onSubmit={(event) => {
                            event.preventDefault();
                            const targetSessionId = String(new FormData(event.currentTarget).get("target"));
                            if (confirm("Gộp toàn bộ món của bàn này vào bàn đã chọn?")) void act(async () => { await api(`/api/staff/sessions/${sessionId}/merge`, { body: { targetSessionId } }); onDone(false); });
                        }}>
                            <label htmlFor="merge-target" className="sr-only">Gộp vào bàn</label>
                            <select id="merge-target" name="target" required className={`${ui.input} flex-1`}>
                                {openSessions.filter((session) => session.id !== sessionId).map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
                            </select>
                            <button type="submit" disabled={busy || openSessions.length < 2} className={ui.small}><FontAwesomeIcon icon={faCodeMerge} /> Gộp vào</button>
                        </form>
                        {detail.devices.length > 0 && (
                            <ul className="grid gap-2" aria-label="Thiết bị khách trong bàn">
                                {detail.devices.map((device, index) => (
                                    <li key={device.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#eee3d7] px-3 py-2 text-sm">
                                        <span><FontAwesomeIcon icon={faMobileScreen} /> Máy khách #{index + 1} · vào lúc {formatDateTime(device.joined_at)}{device.kicked_at ? " · đã loại" : ""}</span>
                                        {!device.kicked_at && (
                                            <button type="button" disabled={busy} onClick={() => { if (confirm("Loại thiết bị lạ này khỏi bàn?")) void act(() => api(`/api/staff/sessions/${sessionId}/devices/${device.id}`, { method: "DELETE" })); }} className={ui.danger}>Loại</button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </details>
            )}

            {(role === "cashier" || finished === "issued") && (
                <CashierPanel detail={detail} reload={async () => { await reload(); onChanged(); }} ask={ask}
                    onIssued={() => setFinished("issued")} onAbnormal={() => setFinished("abnormal")} />
            )}

            <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-[#eee3d7] bg-white pt-3">
                <button type="button" onClick={() => onDone(false)} className={ui.secondary}>Tiếp tục bàn khác</button>
                <button type="button" onClick={() => onDone(true)} className={ui.primary}><FontAwesomeIcon icon={faFlagCheckered} /> Hoàn thành</button>
            </div>
        </div>
    );
}
