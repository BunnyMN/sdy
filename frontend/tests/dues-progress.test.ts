import { describe, expect, it } from "vitest";
import { chargeProgress, instalments, partAmount, partChoices, percent, reportable, totalProgress } from "@/lib/duesProgress";
import type { Payment } from "@/lib/api/dues";

const payment = (id: string, status: Payment["status"], amount: number, created_at: string, charge_id = "c1"): Payment =>
  ({ id, charge_id, user_id: "u", name: "", amount, reference: id, status, review_note: "", created_at });

describe("dues progress", () => {
  it("never reports a part as paid in full", () => {
    expect(percent(9999, 10000)).toBe(99);
    expect(percent(10000, 10000)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });

  it("splits what is left so the parts cover it and the last is the smaller", () => {
    expect(partAmount(10000, 3)).toBe(3334);
    expect(partAmount(10000, 1)).toBe(10000);
    expect(partAmount(0, 2)).toBe(0);
    expect(partChoices(10000)).toEqual([1, 2, 3, 4]);
    expect(partChoices(2)).toEqual([1, 2]);
  });

  it("counts verified money as paid and reported money only as pending", () => {
    const charge = { amount: 10000, paid: 4000, pending: 3000, balance: 6000, waived: false };
    expect(reportable(charge)).toBe(3000);
    expect(chargeProgress(charge)).toMatchObject({ paidPct: 40, pendingPct: 30, left: 3000 });
  });

  it("leaves a waived balance out of what the member owes", () => {
    const total = totalProgress({ charged: 30000, paid: 4000, pending: 0, outstanding: 20000, waived: 6000 });
    expect(total.owed).toBe(24000);
    expect(total.paidPct).toBe(16);
    expect(chargeProgress({ amount: 10000, paid: 4000, pending: 0, balance: 0, waived: true }).paidPct).toBe(100);
  });

  it("numbers the parts in the order they were reported, skipping refused ones", () => {
    const list = instalments([
      payment("b", "pending", 3000, "2026-09-03T00:00:00Z"),
      payment("x", "approved", 1, "2026-09-01T00:00:00Z", "other"),
      payment("a", "approved", 4000, "2026-09-01T00:00:00Z"),
      payment("r", "rejected", 3000, "2026-09-02T00:00:00Z"),
    ], "c1");
    expect(list.map(p => [p.id, p.number])).toEqual([["a", 1], ["r", 0], ["b", 2]]);
  });
});
