"use client";

import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { api, errorMessage } from "@/components/ui/api";
import CodeInput from "@/components/ui/CodeInput";
import { ui } from "@/components/ui/styles";

/** Gửi + xác thực OTP email của owner (mở log, đổi tài khoản ngân hàng). */
export default function OtpPrompt({ purpose, description, onVerified }: {
    purpose: "view_audit" | "change_bank_account";
    description: string;
    onVerified: () => void;
}) {
    const [otp, setOtp] = useState<{ otpId: string; sentTo: string } | null>(null);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function send() {
        setBusy(true);
        setError("");
        try {
            setOtp(await api<{ otpId: string; sentTo: string }>("/api/admin/otp", { body: { purpose } }));
            setCode("");
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function verify(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!otp) return;
        setBusy(true);
        setError("");
        try {
            await api("/api/admin/otp/verify", { body: { purpose, otpId: otp.otpId, code } });
            onVerified();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="grid gap-4">
            <p className="text-sm text-[#806d62]">{description}</p>
            {error && <p role="alert" className={ui.error}>{error}</p>}
            {!otp ? (
                <button type="button" onClick={send} disabled={busy} className={ui.primary}>
                    <FontAwesomeIcon icon={faEnvelope} /> {busy ? "Đang gửi..." : "Gửi mã OTP về email owner"}
                </button>
            ) : (
                <form onSubmit={verify} className="grid gap-3">
                    <CodeInput id={`otp-${purpose}`} name="otp" kind="otp" label="Mã OTP" hint={`Đã gửi mã 6 số tới ${otp.sentTo}. Mã hết hạn sau 5 phút.`} value={code} onChange={setCode} autoFocus />
                    <button type="submit" disabled={busy || code.length !== 6} className={ui.primary}>{busy ? "Đang kiểm tra..." : "Xác thực"}</button>
                    <button type="button" onClick={send} disabled={busy} className={ui.secondary}>Gửi lại mã</button>
                </form>
            )}
        </div>
    );
}
