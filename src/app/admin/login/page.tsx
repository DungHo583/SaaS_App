"use client";

import { faCheck, faEye, faEyeSlash, faKey, faUserLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/components/ui/api";
import CodeInput from "@/components/ui/CodeInput";
import { ui } from "@/components/ui/styles";

const PASSWORD_RULES = [
    { test: (value: string) => value.length >= 8, label: "Ít nhất 8 ký tự" },
    { test: (value: string) => /[A-Z]/.test(value), label: "Có chữ hoa" },
    { test: (value: string) => /[a-z]/.test(value), label: "Có chữ thường" },
    { test: (value: string) => /[0-9]/.test(value), label: "Có chữ số" },
    { test: (value: string) => /[^A-Za-z0-9]/.test(value), label: "Có ký tự đặc biệt" },
];

function LoginForm() {
    const params = useSearchParams();
    const [step, setStep] = useState<"login" | "first">(params.get("step") === "first" ? "first" : "login");
    const [redirectTo, setRedirectTo] = useState("/staff");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [touched, setTouched] = useState(false);

    async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setLoading(true);
        const form = new FormData(event.currentTarget);
        try {
            const data = await api<{ mustChangePassword: boolean; redirectTo: string }>("/api/auth/login", {
                body: { username: String(form.get("username") ?? ""), password: String(form.get("password") ?? "") },
            });
            setRedirectTo(data.redirectTo);
            if (data.mustChangePassword) setStep("first");
            else window.location.assign(data.redirectTo);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleFirstLogin(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setTouched(true);
        setError("");
        if (PASSWORD_RULES.some((rule) => !rule.test(newPassword))) return setError("Mật khẩu mới chưa đạt yêu cầu.");
        if (newPassword !== confirmPassword) return setError("Hai lần nhập mật khẩu không khớp.");
        if (pin !== confirmPin) return setError("Hai lần nhập PIN không khớp.");
        setLoading(true);
        try {
            await api("/api/auth/first-login", { body: { newPassword, pin } });
            const me = await api<{ account: { accountType: string } }>("/api/auth/me");
            const home = me.account.accountType === "owner" ? "/admin/dashboard" : me.account.accountType === "kitchen" ? "/staff/kitchen" : redirectTo;
            window.location.assign(home);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="grid min-h-dvh place-items-center bg-[#fffaf3] px-4 py-8">
            <section className="w-full max-w-md rounded-3xl border border-[#eee3d7] bg-white p-6 shadow-[0_20px_60px_rgba(74,45,34,0.10)] sm:p-9">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#4a2d22] text-2xl text-white" aria-hidden="true">
                        <FontAwesomeIcon icon={step === "login" ? faUserLock : faKey} />
                    </div>
                    <p className="mb-1 text-sm text-[#806d62]">{step === "login" ? "Nhân viên & quản trị" : "Lần đăng nhập đầu tiên"}</p>
                    <h1 className="text-3xl font-bold text-[#4a2d22]">{step === "login" ? "Đăng nhập" : "Đặt mật khẩu & PIN"}</h1>
                </div>

                {error && <div className={`${ui.error} mb-5`} role="alert">{error}</div>}

                {step === "login" ? (
                    <form onSubmit={handleLogin} aria-label="Thông tin đăng nhập">
                        <div className="mb-5">
                            <label htmlFor="username" className="mb-2 block text-sm font-semibold text-[#4a2d22]">Username</label>
                            <input
                                id="username" name="username" type="text" required autoComplete="username" spellCheck={false}
                                autoCapitalize="none" enterKeyHint="next" placeholder="vd. hoxuandung" pattern="[a-zA-Z0-9._]{3,32}"
                                className="min-h-13 w-full rounded-xl border border-[#d9cbbf] bg-white px-4 text-base text-[#4a2d22] outline-none transition focus:border-[#ef7d32] focus:ring-4 focus:ring-[#ef7d32]/15"
                            />
                        </div>
                        <div className="mb-7">
                            <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#4a2d22]">Mật khẩu</label>
                            <div className="relative">
                                <input
                                    id="password" name="password" type={showPassword ? "text" : "password"} required
                                    autoComplete="current-password" enterKeyHint="done" placeholder="Nhập mật khẩu"
                                    className="min-h-13 w-full rounded-xl border border-[#d9cbbf] bg-white px-4 pr-14 text-base text-[#4a2d22] outline-none transition focus:border-[#ef7d32] focus:ring-4 focus:ring-[#ef7d32]/15"
                                />
                                <button
                                    type="button" aria-pressed={showPassword} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                    onClick={() => setShowPassword((value) => !value)}
                                    className="absolute right-2 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-lg text-[#806d62]"
                                >
                                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                                </button>
                            </div>
                            <p className={ui.hint}>Tài khoản mới: dùng mật khẩu tạm do owner cấp.</p>
                        </div>
                        <button type="submit" disabled={loading} className={`${ui.primary} min-h-13 w-full`}>
                            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleFirstLogin} aria-label="Đặt mật khẩu và PIN" className="grid gap-4">
                        <div>
                            <label htmlFor="new-password" className={ui.label}>Mật khẩu mới</label>
                            <input id="new-password" type="password" required autoComplete="new-password" value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)} onBlur={() => setTouched(true)} className={ui.input} />
                            <ul className="mt-2 grid grid-cols-2 gap-1 text-xs" aria-label="Yêu cầu mật khẩu">
                                {PASSWORD_RULES.map((rule) => {
                                    const passed = rule.test(newPassword);
                                    return (
                                        <li key={rule.label} className={passed ? "text-green-700" : touched ? "text-red-700" : "text-[#806d62]"}>
                                            <FontAwesomeIcon icon={faCheck} className={passed ? "" : "opacity-30"} /> {rule.label}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className={ui.label}>Nhập lại mật khẩu mới</label>
                            <input id="confirm-password" type="password" required autoComplete="new-password" value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)} className={ui.input} />
                        </div>
                        <CodeInput id="new-pin" name="pin" kind="pin" label="PIN 6 số" hint="Dùng để mở khoá nhanh trong ca và xác nhận thao tác quan trọng. Không dùng 6 số giống nhau hoặc dãy liên tiếp." value={pin} onChange={setPin} />
                        <CodeInput id="confirm-pin" name="confirmPin" kind="pin" label="Nhập lại PIN" value={confirmPin} onChange={setConfirmPin} />
                        <button type="submit" disabled={loading || pin.length !== 6} className={`${ui.primary} min-h-13 w-full`}>
                            {loading ? "Đang lưu..." : "Lưu và bắt đầu ca"}
                        </button>
                    </form>
                )}
            </section>
        </main>
    );
}

export default function AdminLoginPage() {
    return (
        <Suspense fallback={<main className="grid min-h-dvh place-items-center text-[#806d62]">Đang tải...</main>}>
            <LoginForm />
        </Suspense>
    );
}
