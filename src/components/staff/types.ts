export type Dish = {
    id: string; name: string; description: string; unit: string; price: number; image_url: string | null;
    highlight_badge: "best_seller" | "must_try" | "recommend" | "new" | null; category: string; sold_out: boolean; remaining: number | null;
};
export type Menu = { dishes: Dish[]; categories: string[] };

export type BoardTable = { id: string; name: string; area: string; capacity: number; is_active: boolean; session_id: string | null };
export type BoardSession = {
    id: string; order_type: "dine_in" | "takeaway" | "delivery"; opened_at: string; in_kitchen: number; ready: number;
    served: number; total: number; pending_rounds: number; bill_status: "draft" | "issued" | null;
};
export type RoundItem = { name: string; quantity: number; unit_price: number; note: string | null };
export type WaitingRound = { id: string; table_id: string | null; status: "pending" | "junk"; created_at: string; items: RoundItem[] };

export type SessionItem = {
    id: string; round_id: string; menu_item_id: string; name: string; unit: string; unit_price: number; quantity: number;
    line_total: number; note: string | null; status: string; cancel_stage: string | null; cancel_reason: string | null; source: string;
};
export type Payment = { id: string; method: "cash" | "bank_transfer"; amount: number; status: string; cash_received: number | null; change_given: number | null; transfer_content: string | null };
export type SessionDetail = {
    session: { id: string; order_type: string; status: string; opened_at: string; opened_by: string; table_names: string | null };
    tables: Array<{ id: string; name: string }>;
    items: SessionItem[];
    pendingRounds: Array<{ id: string; status: string; created_at: string; items: RoundItem[] }>;
    devices: Array<{ id: string; user_agent: string; joined_at: string; kicked_at: string | null }>;
    bill: { id: string; status: "draft" | "issued"; series: string; number: number | null; subtotal: number; discount: number; total: number; payments: Payment[] } | null;
    menu: Menu;
    bank: { bin: string; accountNo: string; accountName: string | null } | null;
};
