"use client";

import { useState } from "react";

export default function AdminLoginPage() {
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setLoading(true);

        const form = new FormData(event.currentTarget);

        try {
            const response = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: String(form.get("email") ?? ""),
                    password: String(form.get("password") ?? ""),
                }),
            });
            const data = await response.json();

            if (!response.ok) {
                setError(data.error ?? "Đăng nhập thất bại.");
                return;
            }

            window.location.assign(data.redirectTo);
        } catch {
            setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="grid min-h-dvh place-items-center bg-[#fffaf3] px-4 py-8">
            <section className="w-full max-w-md rounded-3xl border border-[#eee3d7] bg-white p-6 shadow-[0_20px_60px_rgba(74,45,34,0.10)] sm:p-9">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#4a2d22] text-3xl" aria-hidden="true">🍜</div>
                    <p className="mb-1 text-sm text-[#806d62]">Hệ thống quản trị</p>
                    <h1 className="text-3xl font-bold text-[#4a2d22]">Đăng nhập</h1>
                </div>

                <form method="post" action="/api/admin/login" onSubmit={handleSubmit} aria-labelledby="login-title">
                    <h2 id="login-title" className="sr-only">Thông tin đăng nhập quản trị</h2>

                    {error && (
                        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="mb-5">
                        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#4a2d22]">Email quản trị</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            autoComplete="username"
                            spellCheck={false}
                            autoCapitalize="none"
                            enterKeyHint="next"
                            placeholder="admin@bepnha.vn"
                            className="min-h-13 w-full rounded-xl border border-[#d9cbbf] bg-white px-4 text-base text-[#4a2d22] outline-none transition focus:border-[#ef7d32] focus:ring-4 focus:ring-[#ef7d32]/15"
                        />
                    </div>

                    <div className="mb-7">
                        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#4a2d22]">Mật khẩu</label>
                        <div className="relative">
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                required
                                autoComplete="current-password"
                                enterKeyHint="done"
                                placeholder="Nhập mật khẩu"
                                className="min-h-13 w-full rounded-xl border border-[#d9cbbf] bg-white px-4 pr-24 text-base text-[#4a2d22] outline-none transition focus:border-[#ef7d32] focus:ring-4 focus:ring-[#ef7d32]/15"
                            />
                            <button
                                type="button"
                                aria-pressed={showPassword}
                                onClick={() => setShowPassword((value) => !value)}
                                className="absolute right-2 top-1/2 min-h-11 -translate-y-1/2 rounded-lg px-3 text-sm font-semibold text-[#806d62]"
                            >
                                {showPassword ? "Ẩn" : "Hiện"}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="min-h-13 w-full rounded-xl bg-[#ef7d32] text-base font-bold text-white transition hover:bg-[#d66a24] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                    </button>
                </form>
            </section>
        </main>
    );
}
