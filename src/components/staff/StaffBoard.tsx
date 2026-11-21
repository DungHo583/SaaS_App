"use client";

import { faBagShopping, faCheck, faFire, faGaugeHigh, faLock, faRightFromBracket, faRotateLeft, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/components/ui/api";
import Dialog from "@/components/ui/Dialog";
import PinGate, { useSession } from "@/components/ui/PinGate";
import { ui } from "@/components/ui/styles";
import { formatDateTime, formatPrice } from "@/lib/format";
import SessionPanel from "./SessionPanel";
import type { BoardSession, BoardTable, Menu, WaitingRound } from "./types";

type Board = { tables: BoardTable[]; sessions: BoardSession[]; waitingRounds: WaitingRound[]; menu: Menu; capabilities: string[] };

function Board() {
    const { me, lock, logout } = useSession();
    const [board, setBoard] = useState<Board | null>(null);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<{ sessionId: string | null; table: BoardTable | null } | null>(null);
    const [busy, setBusy] = useState(false);
    const canOrder = me.capabilities.includes("order");

    const load = useCallback(() => api<Board>("/api/staff/board").then(
        (data) => { setBoard(data); setError(""); },
        (err: unknown) => setError(errorMessage(err)),
    ), []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10_000);
        return () => window.clearInterval(timer);
    }, [load]);

    const sessionsById = useMemo(() => new Map((board?.sessions ?? []).map((session) => [session.id, session])), [board]);
    const waitingByTable = useMemo(() => {
        const map = new Map<string, WaitingRound[]>();
        for (const round of board?.waitingRounds ?? []) if (round.table_id) map.set(round.table_id, [...(map.get(round.table_id) ?? []), round]);
        return map;
    }, [board]);
    const tableName = (id: string | null) => board?.tables.find((table) => table.id === id)?.name ?? "?";
    const openSessions = (board?.sessions ?? []).map((session) => {
        const tables = board?.tables.filter((table) => table.session_id === session.id).map((table) => table.name) ?? [];
        return { ...session, label: tables.length ? tables.join(" + ") : session.order_type === "takeaway" ? `Mang về ${session.id.slice(0, 4).toUpperCase()}` : `Ship ${session.id.slice(0, 4).toUpperCase()}` };
    });

    async function act(action: () => Promise<unknown>) {
        setBusy(true);
        setError("");
        try {
            await action();
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function openTable(table: BoardTable | null, orderType: "dine_in" | "takeaway" | "delivery" = "dine_in") {
        await act(async () => {
            const data = await api<{ sessionId: string }>("/api/staff/sessions", { body: { tableId: table?.id, orderType } });
            setSelected({ sessionId: data.sessionId, table });
        });
    }

    async function done(shouldLock: boolean) {
        setSelected(null);
        await load();
        if (shouldLock) await lock();
    }

    const takeaways = openSessions.filter((session) => session.order_type !== "dine_in");

    return (
        <main className="mx-auto min-h-dvh max-w-7xl bg-[#fffaf3] px-4 pb-10 pt-4 text-[#4a2d22] sm:px-8">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs text-[#806d62]">{me.restaurantName} · Vận hành</p>
                    <h1 className="text-xl font-bold sm:text-2xl">Xin chào, {me.account.fullName}</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    {me.capabilities.includes("kitchen") && <Link href="/staff/kitchen" className={ui.secondary}><FontAwesomeIcon icon={faFire} /> Khu vực bếp</Link>}
                    {me.capabilities.includes("admin") && <Link href="/admin/dashboard" className={ui.secondary}><FontAwesomeIcon icon={faGaugeHigh} /> Quản trị</Link>}
                    {canOrder && <button type="button" disabled={busy} onClick={() => openTable(null, "takeaway")} className={ui.secondary}><FontAwesomeIcon icon={faBagShopping} /> Đơn mang về</button>}
                    <button type="button" onClick={lock} className={ui.secondary} aria-label="Khoá màn hình"><FontAwesomeIcon icon={faLock} /></button>
                    <button type="button" onClick={logout} className={ui.secondary} aria-label="Kết thúc ca"><FontAwesomeIcon icon={faRightFromBracket} /></button>
                </div>
            </header>

            {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}
            {!board ? <p className="py-10 text-center text-[#806d62]">Đang tải...</p> : (
                <>
                    {board.waitingRounds.length > 0 && (
                        <section className="mb-6" aria-labelledby="waiting-title">
                            <h2 id="waiting-title" className="mb-3 text-lg font-bold">Khách gọi, chờ xác nhận ({board.waitingRounds.length})</h2>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {board.waitingRounds.map((round) => (
                                    <article key={round.id} className={`rounded-2xl border p-4 ${round.status === "junk" ? "border-gray-200 bg-gray-50" : "border-amber-200 bg-amber-50"}`}>
                                        <div className="mb-2 flex items-center justify-between">
                                            <strong>{tableName(round.table_id)}</strong>
                                            <span className={`${ui.badge} ${round.status === "junk" ? "bg-gray-200 text-gray-700" : "bg-amber-200 text-amber-900"}`}>{round.status === "junk" ? "Order rác (quá hạn)" : "Lượt đầu · chờ xác nhận"}</span>
                                        </div>
                                        <p className="text-sm">{round.items.map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</p>
                                        <p className="mb-3 text-xs text-[#806d62]">{formatDateTime(round.created_at)} · {formatPrice(round.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0))}</p>
                                        {canOrder && (
                                            <div className="flex gap-2">
                                                <button type="button" disabled={busy} onClick={() => act(() => api(`/api/staff/rounds/${round.id}`, { body: { action: "confirm" } }))} className={ui.small}>
                                                    <FontAwesomeIcon icon={round.status === "junk" ? faRotateLeft : faCheck} /> {round.status === "junk" ? "Khôi phục" : "Xác nhận & mở bàn"}
                                                </button>
                                                {round.status === "pending" && (
                                                    <button type="button" disabled={busy} onClick={() => act(() => api(`/api/staff/rounds/${round.id}`, { body: { action: "reject", reason: window.prompt("Lý do từ chối (không bắt buộc)") } }))} className={ui.danger}>
                                                        <FontAwesomeIcon icon={faXmark} /> Từ chối
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}

                    <section aria-labelledby="tables-title">
                        <h2 id="tables-title" className="mb-3 text-lg font-bold">Danh sách bàn</h2>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                            {board.tables.filter((table) => table.is_active).map((table) => {
                                const session = table.session_id ? sessionsById.get(table.session_id) : null;
                                const waiting = waitingByTable.get(table.id)?.filter((round) => round.status === "pending").length ?? 0;
                                const tone = session?.ready ? "border-blue-300 bg-blue-50" : session?.pending_rounds || waiting ? "border-amber-300 bg-amber-50" : session ? "border-orange-300 bg-orange-50" : "border-[#eee3d7] bg-white";
                                return (
                                    <button key={table.id} type="button" onClick={() => session ? setSelected({ sessionId: session.id, table }) : setSelected({ sessionId: null, table })}
                                        className={`grid min-h-28 content-between rounded-2xl border p-3 text-left ${tone}`}>
                                        <span className="flex items-center justify-between"><strong className="text-lg">{table.name}</strong><span className="text-xs text-[#806d62]">{table.area}</span></span>
                                        {session ? (
                                            <span className="grid gap-0.5 text-xs">
                                                <span className="font-bold text-[#b84d1d]">{formatPrice(session.total)}</span>
                                                <span>{session.in_kitchen} đang làm · {session.ready} chờ bưng</span>
                                                {session.pending_rounds > 0 && <span className="font-semibold text-amber-800">{session.pending_rounds} lượt chờ xác nhận</span>}
                                                {session.bill_status === "draft" && <span className="font-semibold text-blue-800">Đang thanh toán</span>}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-[#806d62]">{waiting ? <b className="text-amber-800">{waiting} lượt gọi chờ</b> : "Trống"}</span>
                                        )}
                                    </button>
                                );
                            })}
                            {takeaways.map((session) => (
                                <button key={session.id} type="button" onClick={() => setSelected({ sessionId: session.id, table: null })} className="grid min-h-28 content-between rounded-2xl border border-purple-300 bg-purple-50 p-3 text-left">
                                    <strong className="text-lg"><FontAwesomeIcon icon={faBagShopping} /> {session.label}</strong>
                                    <span className="text-xs"><b className="text-[#b84d1d]">{formatPrice(session.total)}</b> · {session.in_kitchen} đang làm · {session.ready} xong</span>
                                </button>
                            ))}
                        </div>
                    </section>
                </>
            )}

            <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.table?.name ?? "Đơn mang về"} wide>
                {selected && (selected.sessionId ? (
                    <SessionPanel
                        key={selected.sessionId}
                        sessionId={selected.sessionId}
                        table={selected.table}
                        freeTables={board?.tables.filter((table) => table.is_active && !table.session_id) ?? []}
                        openSessions={openSessions}
                        onDone={done}
                        onChanged={load}
                    />
                ) : (
                    <div className="grid gap-4 text-center">
                        <p className="text-[#806d62]">Bàn đang trống. {waitingByTable.get(selected.table?.id ?? "")?.length ? "Bàn có lượt gọi của khách chờ xác nhận ở danh sách phía trên." : "Mở bàn khi khách gọi món trực tiếp với nhân viên."}</p>
                        {canOrder ? (
                            <button type="button" disabled={busy} onClick={() => openTable(selected.table)} className={ui.primary}>Mở bàn & gọi món</button>
                        ) : <p className="text-sm text-[#806d62]">Tài khoản của bạn không có vai trò Gọi món.</p>}
                    </div>
                ))}
            </Dialog>
        </main>
    );
}

export default function StaffBoard() {
    return <PinGate><Board /></PinGate>;
}
