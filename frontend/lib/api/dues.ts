import { request } from "./client";

export interface DuesSettings {
  enabled: boolean; monthly_amount: number; due_day: number;
  bank_name: string; account_number: string; account_holder: string; instructions: string;
}
export interface Charge {
  id: string; user_id: string; name: string; period: string; amount: number;
  paid: number; balance: number; due_date: string; waived: boolean; waiver_reason: string;
  /** Reported by the member, not yet decided by finance. */
  pending?: number;
}
export interface Payment {
  id: string; charge_id: string; user_id: string; name: string; amount: number; reference: string;
  status: "pending" | "approved" | "rejected" | "reversed"; review_note: string; created_at: string;
}
export interface DuesPage { charges: Charge[]; payments: Payment[]; has_more: boolean; next_offset: number }
/** The member's whole account in the branch, across every page. */
export interface MyDuesTotals { charged: number; paid: number; pending: number; outstanding: number; waived: number }
export interface MyDuesPage extends DuesPage { totals?: MyDuesTotals }
export interface FinancePage extends DuesPage { totals: { charged: number; received: number; outstanding: number; waived: number } }
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
export const duesApi = {
  settings: () => request<DuesSettings>("/dues/settings"),
  saveSettings: (input: DuesSettings) => request<DuesSettings>("/dues/settings", { method: "PUT", body: JSON.stringify(input) }),
  mine: (offset = 0) => request<MyDuesPage>(`/dues/mine?offset=${offset}`),
  report: (input: { charge_id: string; request_key: string; amount: number; reference: string }) => request<{ id: string; changed: boolean }>("/dues/payments", post(input)),
  charge: (period: string) => request<{ created: number }>("/dues/charges", post({ period })),
  finance: (period: string, offset = 0) => request<FinancePage>(`/dues/finance?period=${encodeURIComponent(period)}&offset=${offset}`),
  review: (id: string, action: "approve" | "reject" | "reverse", reason: string) => request(`/dues/payments/${encodeURIComponent(id)}/review`, post({ action, reason })),
  waive: (id: string, reason: string) => request(`/dues/charges/${encodeURIComponent(id)}/waive`, post({ reason })),
};
