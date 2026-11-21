"use client";

import { faLock, faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";
import CodeInput from "./CodeInput";
import { ui } from "./styles";

export type Me = {
    account: { id: string; username: string; fullName: string; email: string | null; accountType: "owner" | "manager" | "staff" | "kitchen"; roles: string[] };
    capabilities: string[];
    pinFresh: boolean;
    idleSeconds: number;
    restaurantName: string;
};

type SessionContext = { me: Me; lock: () => Promise<void>; logout: () => Promise<void> };
const Context = createContext<SessionContext | null>(null);

export function useSession() {
    const value = useContext(Context);
    if (!value) throw new Error("useSession phải nằm trong <PinGate>.");
    return value;
}

/**
 * Khoá màn hình bằng PIN (BUSINESS_PROCESS 3.2): khoá khi không thao tác `idleSeconds`, khi bấm "Hoàn thành",
 * hoặc khi server trả 423. Server cũng tự kiểm tra cửa sổ PIN, nên khoá phía trình duyệt chỉ để che màn hình sớm.
 */
export default function PinGate({ children }: { children: React.ReactNode }) {
    const [me, setMe] = useState<Me | null>(null);
    const [locked, setLocked] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const timer = useRef<number | undefined>(undefined);

    const lock = useCallback(async () => {
        setLocked(true);
        await api("/api/auth/lock", { method: "POST" }).catch(() => {});
    }, []);

    const logout = useCallback(async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.assign("/admin/login");
    }, []);

    useEffect(() => {
        api<Me & { mustChangePassword: boolean }>("/api/auth/me")
            .then((data) => {
                if (data.mustChangePassword) {
                    window.location.assign("/admin/login?step=first");
                    return;
                }
                setMe(data);
                setLocked(!data.pinFresh);
            })
            .catch(() => window.location.assign("/admin/login"));
    }, []);

    useEffect(() => {
        if (!me) return;
        const reset = () => {
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => { void lock(); }, me.idleSeconds * 1000);
        };
        const onPinRequired = () => setLocked(true);
        const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
        events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
        window.addEventListener("bn:pin-required", onPinRequired);
        reset();
        return () => {
            window.clearTimeout(timer.current);
            events.forEach((name) => window.removeEventListener(name, reset));
            window.removeEventListener("bn:pin-required", onPinRequired);
        };
    }, [me, lock]);

    async function unlock(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await api("/api/auth/pin", { body: { pin } });
            setLocked(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setPin("");
            setBusy(false);
        }
    }

    if (!me) {
        return <main className="grid min-h-dvh place-items-center text-[#806d62]">Đang tải...</main>;
    }

    return (
        <Context.Provider value={{ me, lock, logout }}>
            <div aria-hidden={locked} inert={locked || undefined}>{children}</div>
            {locked && (
                <div className="fixed inset-0 z-[100] grid place-items-center bg-[#fffaf3] p-4">
                    <form onSubmit={unlock} className="w-full max-w-sm rounded-3xl border border-[#eee3d7] bg-white p-6 shadow-[0_20px_60px_rgba(74,45,34,0.10)]">
                        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#4a2d22] text-2xl text-white">
                            <FontAwesomeIcon icon={faLock} />
                        </div>
                        <p className="text-center text-sm text-[#806d62]">{me.restaurantName}</p>
                        <h1 className="mb-1 text-center text-2xl font-bold">{me.account.fullName}</h1>
                        <p className="mb-6 text-center text-sm text-[#806d62]">@{me.account.username}</p>
                        {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}
                        <CodeInput id="unlock-pin" name="pin" kind="pin" label="Nhập PIN để tiếp tục" value={pin} onChange={setPin} autoFocus />
                        <button type="submit" disabled={busy || pin.length !== 6} className={`${ui.primary} mt-5 w-full`}>
                            {busy ? "Đang kiểm tra..." : "Mở khoá"}
                        </button>
                        <button type="button" onClick={logout} className={`${ui.secondary} mt-3 w-full`}>
                            <FontAwesomeIcon icon={faRightFromBracket} /> Kết thúc ca / đổi người
                        </button>
                    </form>
                </div>
            )}
        </Context.Provider>
    );
}
