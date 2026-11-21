"use client";

import { faBuildingColumns, faFloppyDisk, faSliders, faStore, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import OtpPrompt from "@/components/admin/OtpPrompt";
import { api, ApiError, errorMessage } from "@/components/ui/api";
import CodeInput from "@/components/ui/CodeInput";
import Dialog from "@/components/ui/Dialog";
import { ui } from "@/components/ui/styles";
import type { RestaurantSettings } from "@/lib/settings";

type Status = { kind: "ok" | "error"; text: string } | null;

function Section({ icon, title, children }: { icon: typeof faStore; title: string; children: React.ReactNode }) {
    return (
        <section className={`${ui.card} p-5`}>
            <h2 className="mb-4 flex items-center gap-2 font-bold"><FontAwesomeIcon icon={icon} /> {title}</h2>
            {children}
        </section>
    );
}

function StatusLine({ status }: { status: Status }) {
    if (!status) return null;
    return <p role="status" className={status.kind === "ok" ? ui.success : ui.error}>{status.text}</p>;
}

export default function SettingsManager({ initialSettings, owner }: {
    initialSettings: Omit<RestaurantSettings, "updated_at" | "updated_by">;
    owner: { fullName: string; email: string | null; phone: string | null };
}) {
    const [settings, setSettings] = useState(initialSettings);
    const [infoStatus, setInfoStatus] = useState<Status>(null);
    const [bankStatus, setBankStatus] = useState<Status>(null);
    const [configStatus, setConfigStatus] = useState<Status>(null);
    const [profileStatus, setProfileStatus] = useState<Status>(null);
    const [otpOpen, setOtpOpen] = useState(false);
    const [pendingBank, setPendingBank] = useState<Record<string, string> | null>(null);
    const [newPin, setNewPin] = useState("");

    async function patch(body: Record<string, unknown>, setStatus: (status: Status) => void, success: string) {
        setStatus(null);
        try {
            const data = await api<{ settings: typeof settings }>("/api/admin/settings", { method: "PATCH", body });
            setSettings(data.settings);
            setStatus({ kind: "ok", text: success });
            return true;
        } catch (err) {
            if (err instanceof ApiError && err.code === "otp_required") throw err;
            setStatus({ kind: "error", text: errorMessage(err) });
            return false;
        }
    }

    async function saveInfo(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
        await patch(form, setInfoStatus, "Đã lưu thông tin quán. Phiếu mới sẽ dùng thông tin này.");
    }

    async function saveBank(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
        try {
            await patch(form, setBankStatus, "Đã cập nhật tài khoản nhận chuyển khoản.");
        } catch {
            setPendingBank(form);
            setOtpOpen(true);
        }
    }

    async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await patch({
            confirmAllCustomerOrders: form.get("confirmAllCustomerOrders") === "on",
            requireDeviceApproval: form.get("requireDeviceApproval") === "on",
            inventoryEnabled: form.get("inventoryEnabled") === "on",
            inventoryBlocking: form.get("inventoryBlocking") === "on",
            junkRoundMinutes: Number(form.get("junkRoundMinutes")),
            idleLogoutSeconds: Number(form.get("idleLogoutSeconds")),
            pinMaxAttempts: Number(form.get("pinMaxAttempts")),
            shiftMaxHours: Number(form.get("shiftMaxHours")),
        }, setConfigStatus, "Đã lưu cấu hình quy trình.");
    }

    async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setProfileStatus(null);
        const formElement = event.currentTarget;
        const form = Object.fromEntries(new FormData(formElement)) as Record<string, string>;
        if (form.newPassword && form.newPassword !== form.confirmPassword) {
            setProfileStatus({ kind: "error", text: "Hai lần nhập mật khẩu mới không khớp." });
            return;
        }
        try {
            await api("/api/admin/profile", {
                method: "PATCH",
                body: { currentPassword: form.currentPassword, fullName: form.fullName, email: form.email, phone: form.phone, newPassword: form.newPassword || undefined, newPin: newPin || undefined },
            });
            setProfileStatus({ kind: "ok", text: "Đã cập nhật hồ sơ owner." });
            formElement.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((input) => { input.value = ""; });
            setNewPin("");
        } catch (err) {
            setProfileStatus({ kind: "error", text: errorMessage(err) });
        }
    }

    return (
        <AdminShell title="Cài đặt" subtitle="Thông tin quán, thanh toán, quy trình">
            <div className="grid gap-5 xl:grid-cols-2">
                <Section icon={faStore} title="Thông tin quán (in trên phiếu thanh toán)">
                    <form onSubmit={saveInfo} className="grid gap-4">
                        <div><label htmlFor="displayName" className={ui.label}>Tên quán hiển thị</label><input id="displayName" name="displayName" defaultValue={settings.display_name} required maxLength={120} className={ui.input} /></div>
                        <div><label htmlFor="legalName" className={ui.label}>Tên hộ kinh doanh (theo đăng ký)</label><input id="legalName" name="legalName" defaultValue={settings.legal_name} maxLength={200} className={ui.input} /></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label htmlFor="taxCode" className={ui.label}>Mã số thuế</label><input id="taxCode" name="taxCode" defaultValue={settings.tax_code} inputMode="numeric" pattern="([0-9]{10}|[0-9]{10}-[0-9]{3}|[0-9]{12})?" className={ui.input} /><p className={ui.hint}>10 số, 10 số-3 số, hoặc 12 số (CCCD).</p></div>
                            <div><label htmlFor="phone" className={ui.label}>Số điện thoại quán</label><input id="phone" name="phone" type="tel" defaultValue={settings.phone} maxLength={20} className={ui.input} /></div>
                        </div>
                        <div><label htmlFor="address" className={ui.label}>Địa chỉ</label><input id="address" name="address" defaultValue={settings.address} maxLength={300} autoComplete="street-address" className={ui.input} /></div>
                        <div><label htmlFor="shopEmail" className={ui.label}>Email quán</label><input id="shopEmail" name="email" type="email" defaultValue={settings.email} maxLength={254} className={ui.input} /></div>
                        <StatusLine status={infoStatus} />
                        <button type="submit" className={ui.primary}><FontAwesomeIcon icon={faFloppyDisk} /> Lưu thông tin quán</button>
                    </form>
                </Section>

                <Section icon={faBuildingColumns} title="Tài khoản nhận chuyển khoản (VietQR)">
                    <form onSubmit={saveBank} className="grid gap-4">
                        <p className="text-sm text-[#806d62]">Mã QR thanh toán sinh theo tài khoản này. <b>Đổi tài khoản phải xác thực OTP</b> gửi về email owner để tránh bị đổi sang tài khoản khác.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label htmlFor="bankBin" className={ui.label}>Mã ngân hàng (BIN 6 số)</label><input id="bankBin" name="bankBin" defaultValue={settings.bank_bin ?? ""} inputMode="numeric" pattern="[0-9]{6}" placeholder="vd. 970436 (Vietcombank)" className={ui.input} /></div>
                            <div><label htmlFor="bankAccountNo" className={ui.label}>Số tài khoản</label><input id="bankAccountNo" name="bankAccountNo" defaultValue={settings.bank_account_no ?? ""} inputMode="numeric" pattern="[0-9A-Za-z]{4,19}" className={ui.input} /></div>
                        </div>
                        <div><label htmlFor="bankAccountName" className={ui.label}>Tên chủ tài khoản</label><input id="bankAccountName" name="bankAccountName" defaultValue={settings.bank_account_name ?? ""} maxLength={100} className={`${ui.input} uppercase`} /></div>
                        <StatusLine status={bankStatus} />
                        <button type="submit" className={ui.primary}><FontAwesomeIcon icon={faFloppyDisk} /> Lưu tài khoản nhận tiền</button>
                    </form>
                </Section>

                <Section icon={faSliders} title="Cấu hình quy trình">
                    <form onSubmit={saveConfig} className="grid gap-4">
                        {[
                            ["confirmAllCustomerOrders", settings.confirm_all_customer_orders, "Mọi lượt gọi của khách phải được nhân viên xác nhận rồi mới vào bếp (khuyến nghị bật)."],
                            ["requireDeviceApproval", settings.require_device_approval, "Thiết bị mới của nhân viên phải được owner duyệt trước khi đăng nhập."],
                            ["inventoryEnabled", settings.inventory_enabled, "Bật module kho: số phần tính theo định lượng nguyên liệu."],
                            ["inventoryBlocking", settings.inventory_blocking, "Chặn gọi món khi kho không đủ nguyên liệu (mặc định chỉ cảnh báo)."],
                        ].map(([name, checked, label]) => (
                            <label key={String(name)} className="flex items-start gap-3">
                                <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="mt-1 size-5 accent-[#ef7d32]" />
                                <span className="text-sm">{String(label)}</span>
                            </label>
                        ))}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label htmlFor="junkRoundMinutes" className={ui.label}>Phút chờ trước khi thành order rác</label><input id="junkRoundMinutes" name="junkRoundMinutes" type="number" min={1} max={120} defaultValue={settings.junk_round_minutes} className={ui.input} /></div>
                            <div><label htmlFor="idleLogoutSeconds" className={ui.label}>Giây không thao tác thì khoá PIN</label><input id="idleLogoutSeconds" name="idleLogoutSeconds" type="number" min={15} max={3600} defaultValue={settings.idle_logout_seconds} className={ui.input} /></div>
                            <div><label htmlFor="pinMaxAttempts" className={ui.label}>Số lần nhập sai PIN tối đa</label><input id="pinMaxAttempts" name="pinMaxAttempts" type="number" min={3} max={10} defaultValue={settings.pin_max_attempts} className={ui.input} /></div>
                            <div><label htmlFor="shiftMaxHours" className={ui.label}>Thời lượng ca đăng nhập (giờ)</label><input id="shiftMaxHours" name="shiftMaxHours" type="number" min={1} max={24} defaultValue={settings.shift_max_hours} className={ui.input} /></div>
                        </div>
                        <StatusLine status={configStatus} />
                        <button type="submit" className={ui.primary}><FontAwesomeIcon icon={faFloppyDisk} /> Lưu cấu hình</button>
                    </form>
                </Section>

                <Section icon={faUserShield} title="Hồ sơ owner">
                    <form onSubmit={saveProfile} className="grid gap-4">
                        <div><label htmlFor="ownerName" className={ui.label}>Họ tên</label><input id="ownerName" name="fullName" defaultValue={owner.fullName} required maxLength={100} className={ui.input} /></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label htmlFor="ownerEmail" className={ui.label}>Email nhận OTP</label><input id="ownerEmail" name="email" type="email" defaultValue={owner.email ?? ""} required autoComplete="email" className={ui.input} /></div>
                            <div><label htmlFor="ownerPhone" className={ui.label}>Số điện thoại</label><input id="ownerPhone" name="phone" type="tel" defaultValue={owner.phone ?? ""} autoComplete="tel" className={ui.input} /></div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label htmlFor="newPassword" className={ui.label}>Mật khẩu mới (để trống nếu không đổi)</label><input id="newPassword" name="newPassword" type="password" autoComplete="new-password" className={ui.input} /></div>
                            <div><label htmlFor="confirmPassword" className={ui.label}>Nhập lại mật khẩu mới</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" className={ui.input} /></div>
                        </div>
                        <CodeInput id="owner-new-pin" name="newPinInput" kind="pin" label="PIN mới (để trống nếu không đổi)" value={newPin} onChange={setNewPin} />
                        <div><label htmlFor="currentPassword" className={ui.label}>Mật khẩu hiện tại (bắt buộc để lưu)</label><input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className={ui.input} /></div>
                        <StatusLine status={profileStatus} />
                        <button type="submit" className={ui.primary}><FontAwesomeIcon icon={faFloppyDisk} /> Lưu hồ sơ</button>
                    </form>
                </Section>
            </div>

            <Dialog open={otpOpen} onClose={() => setOtpOpen(false)} title="Xác thực đổi tài khoản nhận tiền">
                <OtpPrompt
                    purpose="change_bank_account"
                    description="Để bảo vệ tiền của quán, đổi tài khoản nhận chuyển khoản cần mã OTP gửi về email owner."
                    onVerified={async () => {
                        setOtpOpen(false);
                        if (pendingBank) await patch(pendingBank, setBankStatus, "Đã cập nhật tài khoản nhận chuyển khoản.").catch(() => {});
                    }}
                />
            </Dialog>
        </AdminShell>
    );
}
