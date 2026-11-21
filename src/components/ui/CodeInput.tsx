"use client";

import { ui } from "./styles";

/**
 * Ô nhập PIN / OTP 6 số: MỘT input, type="text" + inputmode="numeric" (giữ số 0 đầu, bàn phím số trên mobile).
 * PIN che ký tự bằng -webkit-text-security; OTP dùng autocomplete="one-time-code".
 */
export default function CodeInput({ id, name, label, hint, kind, value, onChange, autoFocus }: {
    id: string;
    name: string;
    label: string;
    hint?: string;
    kind: "pin" | "otp";
    value: string;
    onChange: (value: string) => void;
    autoFocus?: boolean;
}) {
    return (
        <div>
            <label htmlFor={id} className={ui.label}>{label}</label>
            {hint && <p id={`${id}-hint`} className="mb-2 text-xs text-[#806d62]">{hint}</p>}
            <input
                id={id}
                name={name}
                type="text"
                inputMode="numeric"
                autoComplete={kind === "otp" ? "one-time-code" : "off"}
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus={autoFocus}
                aria-describedby={hint ? `${id}-hint` : undefined}
                value={value}
                onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${ui.input} code-input`}
                style={kind === "pin" ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
            />
        </div>
    );
}
