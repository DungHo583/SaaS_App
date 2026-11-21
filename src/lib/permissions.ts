/**
 * Ma trận quyền (docs/BUSINESS_PROCESS.md mục 2.2).
 * - admin: trang quản trị, CRUD tài khoản/menu/bàn, config, thống kê, log, duyệt → chỉ owner.
 * - order / runner / cashier: vận hành. Quản lý có cả ba. Nhân viên theo vai trò được cấp.
 * - kitchen: tài khoản bếp. Owner/quản lý được làm khi bất khả kháng (đánh dấu is_elevated trong log).
 */
export type AccountType = "owner" | "manager" | "staff" | "kitchen";
export type OperationalRole = "order" | "runner" | "cashier" | "kitchen";
export type Capability = "admin" | OperationalRole;

export const ROLE_LABELS: Record<OperationalRole, string> = {
    order: "Gọi món",
    runner: "Chạy bàn",
    cashier: "Thu ngân",
    kitchen: "Bếp",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    owner: "Owner",
    manager: "Quản lý",
    staff: "Nhân viên",
    kitchen: "Bếp",
};

export type AccountLike = { account_type: AccountType; roles: string[] };

export function can(account: AccountLike, capability: Capability): boolean {
    if (account.account_type === "owner") return true;
    if (capability === "admin") return false;
    if (account.account_type === "manager") return true;
    if (account.account_type === "kitchen") return capability === "kitchen";
    return account.roles.includes(capability);
}

export function capabilities(account: AccountLike): Capability[] {
    return (["admin", "order", "runner", "cashier", "kitchen"] as const).filter((capability) => can(account, capability));
}

/** Owner/quản lý làm thao tác của bếp = bất khả kháng (✓⚠). */
export function isElevated(account: AccountLike, capability: Capability) {
    return capability === "kitchen" && (account.account_type === "owner" || account.account_type === "manager");
}

/** Giá trị audit_log.role_context cho thao tác. */
export function roleContext(account: AccountLike, capability: Capability): string {
    if (capability === "admin") return "owner";
    return capability;
}
