"use client";

import { useCallback, useRef, useState } from "react";
import CodeInput from "@/components/ui/CodeInput";
import Dialog from "@/components/ui/Dialog";
import { ui } from "@/components/ui/styles";

type Request = { title: string; description: string; reasonLabel?: string };
export type PinResult = { pin: string; reason: string };

/**
 * Hỏi lại PIN (và lý do nếu cần) trước thao tác nhạy cảm: thu tiền, phát hành phiếu, đóng bất thường, huỷ món đã nấu.
 * Dùng: const { ask, dialog } = usePinConfirm(); const result = await ask({...}); {dialog}
 */
export function usePinConfirm() {
    const [request, setRequest] = useState<Request | null>(null);
    const [pin, setPin] = useState("");
    const [reason, setReason] = useState("");
    const resolver = useRef<((value: PinResult | null) => void) | null>(null);

    const ask = useCallback((next: Request) => new Promise<PinResult | null>((resolve) => {
        resolver.current = resolve;
        setPin("");
        setReason("");
        setRequest(next);
    }), []);

    function finish(value: PinResult | null) {
        resolver.current?.(value);
        resolver.current = null;
        setRequest(null);
    }

    const dialog = (
        <Dialog open={Boolean(request)} onClose={() => finish(null)} title={request?.title ?? "Xác nhận"}>
            {request && (
                <form
                    onSubmit={(event) => { event.preventDefault(); finish({ pin, reason: reason.trim() }); }}
                    className="grid gap-4"
                >
                    <p className="text-sm text-[#806d62]">{request.description}</p>
                    {request.reasonLabel && (
                        <div>
                            <label htmlFor="confirm-reason" className={ui.label}>{request.reasonLabel}</label>
                            <textarea id="confirm-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-20 w-full rounded-xl border border-[#d9cbbf] p-3" />
                        </div>
                    )}
                    <CodeInput id="confirm-pin" name="pin" kind="pin" label="PIN của bạn" value={pin} onChange={setPin} autoFocus={!request.reasonLabel} />
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => finish(null)} className={ui.secondary}>Huỷ</button>
                        <button type="submit" disabled={pin.length !== 6 || (Boolean(request.reasonLabel) && !reason.trim())} className={ui.primary}>Xác nhận</button>
                    </div>
                </form>
            )}
        </Dialog>
    );

    return { ask, dialog };
}
