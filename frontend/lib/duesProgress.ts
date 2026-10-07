import type { Charge, MyDuesTotals, Payment } from "./api/dues";

/**
 * The arithmetic behind the member's dues screen, kept apart from it so the
 * numbers a member reads about their own money are tested on their own.
 *
 * Paid is what finance has verified. Pending is what the member has reported
 * and finance has not yet decided: shown, but never counted as paid.
 */

/** Whole percent of `part` in `whole`, 0–100. Rounded down, so 99.6% never reads as paid in full. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.floor((part / whole) * 100)));
}

/** What a charge still owes that has not already been reported. */
export function reportable(charge: Pick<Charge, "balance" | "pending">): number {
  return Math.max(0, charge.balance - (charge.pending ?? 0));
}

export interface Progress { owed: number; paid: number; pending: number; left: number; paidPct: number; pendingPct: number }

/** One charge's progress: verified, awaiting verification, and what is left to report. */
export function chargeProgress(charge: Pick<Charge, "amount" | "paid" | "pending" | "waived" | "balance">): Progress {
  const owed = charge.waived ? Math.min(charge.amount, charge.paid) : charge.amount;
  const pending = charge.waived ? 0 : Math.min(charge.pending ?? 0, Math.max(0, owed - charge.paid));
  const paidPct = percent(charge.paid, owed);
  return { owed, paid: charge.paid, pending, left: reportable(charge), paidPct, pendingPct: Math.min(100 - paidPct, percent(pending, owed)) };
}

/** The member's whole account. A waived balance is not owed, so it is not in the share. */
export function totalProgress(totals: MyDuesTotals): Progress {
  const owed = Math.max(0, totals.charged - totals.waived);
  const paidPct = percent(totals.paid, owed);
  return {
    owed, paid: totals.paid, pending: totals.pending,
    left: Math.max(0, totals.outstanding - totals.pending),
    paidPct, pendingPct: Math.min(100 - paidPct, percent(totals.pending, owed)),
  };
}

/**
 * The next transfer when what is left is paid in `parts` equal transfers.
 * Rounded up to the tögrög, so the last part is the smaller one and the parts
 * never fall short of the balance.
 */
export function partAmount(left: number, parts: number): number {
  if (left <= 0) return 0;
  return Math.ceil(left / Math.max(1, Math.floor(parts)));
}

/** The split choices that make sense for this balance: no part below 1₮. */
export function partChoices(left: number, max = 4): number[] {
  return Array.from({ length: max }, (_, i) => i + 1).filter(parts => parts === 1 || left >= parts);
}

export interface Instalment extends Payment { number: number }

/**
 * A charge's transfers in the order they were reported, numbered as the
 * member's parts. A rejected or reversed transfer keeps its place in the
 * list but not a number: it was not a part of the payment.
 */
export function instalments(payments: Payment[], chargeID: string): Instalment[] {
  let number = 0;
  return payments
    .filter(payment => payment.charge_id === chargeID)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map(payment => ({ ...payment, number: payment.status === "approved" || payment.status === "pending" ? ++number : 0 }));
}
