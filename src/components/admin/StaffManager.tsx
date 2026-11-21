"use client";

import { faCopy, faKey, faLaptop, faPen, faPlus, faShieldHalved, faUserSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { api, errorMessage } from "@/components/ui/api";
import Dialog from "@/components/ui/Dialog";
import { ui } from "@/components/ui/styles";
import { formatDateTime } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, ROLE_LABELS, type AccountType, type OperationalRole } from "@/lib/permissions";

type Device = { id: string; user_agent: string; last_ip: string | null; first_seen_at: string; last_seen_at: string; approved_at: string | null; revoked_at: string | null };
export type Account = {
    id: string; username: string; full_name: string; email: string | null; phone: string | null; account_type: AccountType;
    roles: string[]; must_change_password: boolean; is_active: boolean; last_login_at: string | null; devices: Device[];
};

const STAFF_ROLES: OperationalRole[] = ["order", "runner", "cashier"];

function describeDevice(userAgent: string) {
    const os = /iPhone|iPad/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android" : /Mac OS/.test(userAgent) ? "macOS" : /Windows/.test(userAgent) ? "Windows" : "Thiết bị khác";
    const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : /Firefox\//.test(userAgent) ? "Firefox" : "trình duyệt";
    return `${browser} trên ${os}`;
}

export default function StaffManager({ initialAccounts, requireDeviceApproval }: { initialAccounts: Account[]; requireDeviceApproval: boolean }) {
    const [accounts, setAccounts] = useState(initialAccounts);
    const [editing, setEditing] = useState<Account | null>(null);
    const [open, setOpen] = useState(false);
    const [accountType, setAccountType] = useState<Exclude<AccountType, "owner">>("staff");
    const [roles, setRoles] = useState<OperationalRole[]>(["order"]);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);

    function openForm(account: Account | null) {
        setEditing(account);
        setError("");
        setAccountType(account && account.account_type !== "owner" ? account.account_type : "staff");
        setRoles(account?.account_type === "staff" ? account.roles as OperationalRole[] : ["order"]);
        setOpen(true);
    }

    function toggleRole(role: OperationalRole) {
        setRoles((current) => current.includes(role) ? current.filter((value) => value !== role) : current.length >= 2 ? current : [...current, role]);
    }

    async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (accountType === "staff" && roles.length === 0) { setError("Chọn ít nhất 1 vai trò."); return; }
        setSaving(true);
        setError("");
        const form = new FormData(event.currentTarget);
        const payload = {
            ...(editing ? {} : { username: String(form.get("username") ?? "").trim().toLowerCase() }),
            fullName: String(form.get("fullName") ?? ""),
            email: String(form.get("email") ?? ""),
            phone: String(form.get("phone") ?? ""),
            accountType,
            roles: accountType === "staff" ? roles : [],
            ...(editing ? { isActive: form.get("isActive") === "on" } : {}),
        };
        try {
            if (editing) {
                const data = await api<{ account: Account }>(`/api/admin/accounts/${editing.id}`, { method: "PATCH", body: payload });
                setAccounts((current) => current.map((row) => row.id === editing.id ? { ...data.account, devices: row.devices } : row));
            } else {
                const data = await api<{ account: Account; temporaryPassword: string }>("/api/admin/accounts", { body: payload });
                setAccounts((current) => [...current, data.account]);
                setSecret({ username: data.account.username, password: data.temporaryPassword });
            }
            setOpen(false);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    async function resetPassword(account: Account) {
        if (!confirm(`Cấp lại mật khẩu tạm cho @${account.username}? Mật khẩu và PIN hiện tại mất hiệu lực, ca đang mở sẽ bị kết thúc.`)) return;
        try {
            const data = await api<{ temporaryPassword: string }>(`/api/admin/accounts/${account.id}/reset-password`, { method: "POST" });
            setAccounts((current) => current.map((row) => row.id === account.id ? { ...row, must_change_password: true } : row));
            setSecret({ username: account.username, password: data.temporaryPassword });
        } catch (err) {
            alert(errorMessage(err));
        }
    }

    async function deviceAction(account: Account, device: Device, action: "approve" | "revoke" | "restore") {
        try {
            const data = await api<{ device: Pick<Device, "id" | "approved_at" | "revoked_at"> }>(`/api/admin/devices/${device.id}`, { method: "PATCH", body: { action } });
            const update = (row: Account) => ({ ...row, devices: row.devices.map((item) => item.id === device.id ? { ...item, ...data.device } : item) });
            setAccounts((current) => current.map((row) => row.id === account.id ? update(row) : row));
            setEditing((current) => current && current.id === account.id ? update(current) : current);
        } catch (err) {
            setError(errorMessage(err));
        }
    }

    const roleText = (account: Account) => account.account_type === "staff"
        ? account.roles.map((role) => ROLE_LABELS[role as OperationalRole]).join(" + ")
        : ACCOUNT_TYPE_LABELS[account.account_type];

    return (
        <AdminShell
            title="Quản lý nhân viên"
            actions={<button type="button" onClick={() => openForm(null)} className={`${ui.primary} min-h-11 text-sm`}><FontAwesomeIcon icon={faPlus} /> Thêm tài khoản</button>}
        >
            <p className="mb-5 text-sm text-[#806d62]">{accounts.filter((account) => account.is_active).length} tài khoản đang hoạt động · Bếp dùng 1 tài khoản chung trên thiết bị đặt tại bếp.</p>
            <section className={`${ui.card} overflow-hidden`}>
                <ul className="divide-y divide-[#eee3d7]">
                    {accounts.map((account) => (
                        <li key={account.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_170px_120px_auto] sm:items-center">
                            <div>
                                <h2 className="font-bold">{account.full_name} <span className="font-normal text-[#806d62]">@{account.username}</span></h2>
                                <p className="text-sm text-[#806d62]">{account.email || "Chưa có email"} · {account.phone || "Chưa có SĐT"}</p>
                                <p className="text-xs text-[#806d62]">
                                    {account.must_change_password ? "Chưa đăng nhập lần đầu" : account.last_login_at ? `Đăng nhập gần nhất ${formatDateTime(account.last_login_at)}` : "Chưa đăng nhập"}
                                    {" · "}<FontAwesomeIcon icon={faLaptop} /> {account.devices.filter((device) => !device.revoked_at).length} thiết bị
                                </p>
                            </div>
                            <span className="text-sm font-semibold">{roleText(account)}</span>
                            <span className={`${ui.badge} justify-self-start ${account.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                {account.is_active ? "Hoạt động" : "Đã khoá"}
                            </span>
                            {account.account_type === "owner" ? (
                                <span className="text-xs text-[#806d62]">Sửa trong Cài đặt</span>
                            ) : (
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => openForm(account)} className={ui.small} aria-label={`Sửa @${account.username}`}><FontAwesomeIcon icon={faPen} /> Sửa</button>
                                    <button type="button" onClick={() => resetPassword(account)} disabled={!account.is_active} className={ui.small} aria-label={`Cấp lại mật khẩu @${account.username}`}><FontAwesomeIcon icon={faKey} /></button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <Dialog open={Boolean(secret)} onClose={() => { setSecret(null); setCopied(false); }} title="Mật khẩu tạm">
                {secret && (
                    <div className="grid gap-4">
                        <p className={ui.success}>Mật khẩu tạm chỉ hiển thị <b>một lần</b>. Đưa cho nhân viên <b>@{secret.username}</b>; khi đăng nhập lần đầu, nhân viên phải đổi mật khẩu và đặt PIN.</p>
                        <output className="code-input block rounded-xl border border-[#d9cbbf] bg-[#fffaf3] px-3 py-3 text-xl">{secret.password}</output>
                        <button type="button" className={ui.primary} onClick={async () => { await navigator.clipboard.writeText(secret.password); setCopied(true); }}>
                            <FontAwesomeIcon icon={faCopy} /> {copied ? "Đã sao chép" : "Sao chép"}
                        </button>
                    </div>
                )}
            </Dialog>

            <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `Sửa @${editing.username}` : "Thêm tài khoản"}>
                {error && <p role="alert" className={`${ui.error} mb-4`}>{error}</p>}
                <form onSubmit={saveAccount} className="grid gap-4">
                    <div>
                        <label htmlFor="account-username" className={ui.label}>Username</label>
                        <input id="account-username" name="username" defaultValue={editing?.username ?? ""} disabled={Boolean(editing)} required={!editing}
                            pattern="[a-z0-9][a-z0-9._]{1,30}[a-z0-9]" autoCapitalize="none" spellCheck={false} placeholder="vd. hoxuandung, dung.hoxuan, hxdung" className={ui.input} />
                        <p className={ui.hint}>Chữ thường không dấu, số, dấu chấm hoặc gạch dưới (3–32 ký tự). Trùng tên thì thêm số: hoxuandung1. Không đổi được sau khi tạo.</p>
                    </div>
                    <div><label htmlFor="account-name" className={ui.label}>Họ tên</label><input id="account-name" name="fullName" defaultValue={editing?.full_name ?? ""} required maxLength={100} className={ui.input} /></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div><label htmlFor="account-email" className={ui.label}>Email (nhận cảnh báo đăng nhập)</label><input id="account-email" name="email" type="email" defaultValue={editing?.email ?? ""} autoComplete="off" className={ui.input} /></div>
                        <div><label htmlFor="account-phone" className={ui.label}>Số điện thoại</label><input id="account-phone" name="phone" type="tel" defaultValue={editing?.phone ?? ""} className={ui.input} /></div>
                    </div>
                    <fieldset>
                        <legend className={ui.label}>Loại tài khoản</legend>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {(["staff", "manager", "kitchen"] as const).map((type) => (
                                <label key={type} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${accountType === type ? "border-[#ef7d32] bg-[#fffaf3]" : "border-[#eee3d7]"}`}>
                                    <input type="radio" name="accountType" value={type} checked={accountType === type} onChange={() => setAccountType(type)} className="accent-[#ef7d32]" />
                                    {ACCOUNT_TYPE_LABELS[type]}
                                </label>
                            ))}
                        </div>
                        <p className={ui.hint}>
                            {accountType === "manager" ? "Quản lý: làm được mọi việc vận hành (gọi món, chạy bàn, thu ngân; bếp khi bất khả kháng). Không vào trang quản trị. Tối đa 2 tài khoản."
                                : accountType === "kitchen" ? "Bếp: tài khoản riêng, chỉ dùng trên thiết bị ở khu vực bếp. Mỗi quán 1 tài khoản bếp."
                                    : "Nhân viên: chọn 1–2 vai trò. Vai trò bếp luôn tách riêng."}
                        </p>
                    </fieldset>
                    {accountType === "staff" && (
                        <fieldset>
                            <legend className={ui.label}>Vai trò ({roles.length}/2)</legend>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {STAFF_ROLES.map((role) => (
                                    <label key={role} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${roles.includes(role) ? "border-[#ef7d32] bg-[#fffaf3]" : "border-[#eee3d7]"} ${!roles.includes(role) && roles.length >= 2 ? "opacity-50" : ""}`}>
                                        <input type="checkbox" checked={roles.includes(role)} disabled={!roles.includes(role) && roles.length >= 2} onChange={() => toggleRole(role)} className="accent-[#ef7d32]" />
                                        {ROLE_LABELS[role]}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    )}
                    {editing && (
                        <label className="flex min-h-12 items-center gap-3">
                            <input name="isActive" type="checkbox" defaultChecked={editing.is_active} className="size-5 accent-[#ef7d32]" />
                            <span className="text-sm font-semibold">Tài khoản đang hoạt động (bỏ chọn = khoá, kết thúc mọi ca)</span>
                        </label>
                    )}
                    {editing && editing.devices.length > 0 && (
                        <section aria-labelledby="devices-title">
                            <h3 id="devices-title" className={ui.label}>Thiết bị đã đăng nhập {requireDeviceApproval && <span className="font-normal text-[#806d62]">(đang bật duyệt thiết bị mới)</span>}</h3>
                            <ul className="grid gap-2">
                                {editing.devices.map((device) => (
                                    <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eee3d7] px-3 py-2 text-sm">
                                        <span>
                                            <b>{describeDevice(device.user_agent)}</b>
                                            <span className="block text-xs text-[#806d62]">Lần cuối {formatDateTime(device.last_seen_at)} · IP {device.last_ip ?? "?"}</span>
                                        </span>
                                        <span className="flex gap-2">
                                            {device.revoked_at ? (
                                                <button type="button" onClick={() => deviceAction(editing, device, "restore")} className={ui.small}>Khôi phục</button>
                                            ) : (
                                                <>
                                                    {!device.approved_at && <button type="button" onClick={() => deviceAction(editing, device, "approve")} className={ui.small}><FontAwesomeIcon icon={faShieldHalved} /> Duyệt</button>}
                                                    <button type="button" onClick={() => deviceAction(editing, device, "revoke")} className={ui.danger}><FontAwesomeIcon icon={faUserSlash} /> Thu hồi</button>
                                                </>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {!editing && <p className={ui.hint}>Hệ thống sẽ sinh mật khẩu tạm ngẫu nhiên sau khi lưu.</p>}
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setOpen(false)} className={ui.secondary}>Huỷ</button>
                        <button type="submit" disabled={saving} className={ui.primary}>{saving ? "Đang lưu..." : "Lưu tài khoản"}</button>
                    </div>
                </form>
            </Dialog>
        </AdminShell>
    );
}
