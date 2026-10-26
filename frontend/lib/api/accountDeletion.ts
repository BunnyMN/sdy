import { request } from "./client";

/**
 * Бүртгэл устгах хүсэлт — the web half of what the iOS member app also calls.
 *
 * The backend contract (backend/internal/workspace/profile/deletion.go,
 * migration 00115):
 *
 *   POST /api/v1/profile/deletion-request  {"reason"?: string ≤ 500}
 *     → 202 AccountDeletionRequest (status "pending")
 *     Revokes every session of the caller, including this one, and clears the
 *     cookie. A screen that calls it should treat success as sign-out.
 *
 *   GET /api/v1/profile/deletion-request
 *     → 200 AccountDeletionRequest ("none" when nothing was ever asked)
 *
 * Signing in again inside the grace period cancels the request and restores
 * the memberships it ended, so a signed-in person reading the status will see
 * "cancelled" (or "none"), never "pending".
 *
 * Kept out of app/profile on purpose: that screen's "Бүртгэл устгах" section is
 * a separate change, and this file is what it will import.
 */
export type AccountDeletionStatus = "none" | "pending" | "cancelled" | "completed";

export interface AccountDeletionRequest {
  id?: string;
  status: AccountDeletionStatus;
  requested_at?: string;
  /** When the account is anonymised if nobody signs in first. Pending only. */
  scheduled_for?: string;
  processed_at?: string;
  grace_days: number;
}

export const ACCOUNT_DELETION_REASON_MAX = 500;

export const accountDeletionApi = {
  status: () => request<AccountDeletionRequest>("/profile/deletion-request"),
  request: (reason = "") =>
    request<AccountDeletionRequest>("/profile/deletion-request", {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim().slice(0, ACCOUNT_DELETION_REASON_MAX) }),
    }),
};
