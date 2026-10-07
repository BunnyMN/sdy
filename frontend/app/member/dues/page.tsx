"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { duesApi, type Charge, type DuesSettings, type MyDuesPage, type Payment } from "@/lib/api/dues";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, Loading } from "@/components/ui";
import { chargeProgress, instalments, partAmount, partChoices, reportable, totalProgress, type Progress } from "@/lib/duesProgress";

import { memberMoney as money, memberDate } from "@/lib/memberFormat";

/** Verified money in the accent, money awaiting verification beside it, lighter. */
function ProgressBar({ progress, label }: { progress: Progress; label: string }) {
  return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.paidPct}
    className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
    <span className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress.paidPct}%` }} />
    <span className="h-full bg-accent opacity-40 transition-[width] duration-300" style={{ width: `${progress.pendingPct}%` }} />
  </div>;
}

/** One transfer toward a charge, numbered as the member's part. */
function Instalment({ part, t }: { part: Payment & { number: number }; t: ReturnType<typeof useI18n>["t"] }) {
  const tone = part.status === "approved" ? "text-success" : part.status === "pending" ? "text-muted" : "text-danger line-through";
  return <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
    <span className="font-medium">{part.number ? t("dues.part", { n: part.number }) : "—"}</span>
    <span className={`tabular-nums ${part.status === "approved" ? "font-semibold" : ""}`}>{money(part.amount)}</span>
    <span className={`text-xs ${tone}`}>{t(`dues.${part.status}`)}</span>
    <time className="w-full text-xs text-muted sm:w-auto">{memberDate(part.created_at)}</time>
  </li>;
}

type Report = { charge: Charge; parts: number; amount: number; reference: string; key: string };

export default function MemberDues() {
  const { t } = useI18n();
  const { allowed: finance } = useAccess("membership.finance");
  const [data, setData] = useState<MyDuesPage | null>(null);
  const [settings, setSettings] = useState<DuesSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const load = useCallback(async () => {
    const [next, config] = await Promise.all([duesApi.mine(), duesApi.settings()]);
    setData(next); setSettings(config);
  }, []);
  useEffect(() => { void load().catch(err => setError(err instanceof Error ? err.message : "—")); }, [load]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!report) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await duesApi.report({ charge_id: report.charge.id, amount: report.amount, reference: report.reference.trim(), request_key: report.key });
      setReport(null); setNotice(t("dues.sent")); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  async function more() {
    if (!data) return; setBusy(true); setError("");
    try { const next = await duesApi.mine(data.next_offset); setData({ ...next, charges: [...data.charges, ...next.charges], payments: [...data.payments, ...next.payments] }); }
    catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  const open = (charge: Charge) => {
    const left = reportable(charge);
    setReport({ charge, parts: 1, amount: left, reference: "", key: crypto.randomUUID() }); setError("");
  };
  const split = (parts: number) => report && setReport({ ...report, parts, amount: partAmount(reportable(report.charge), parts) });
  const total = data?.totals && data.totals.charged > 0 ? totalProgress(data.totals) : null;

  return <div className="mx-auto max-w-[720px] space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{t("dues.title")}</h1>{finance && <Link className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm" href="/member/finance">{t("dues.finance")}</Link>}</header>
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="rounded-xl bg-success-soft p-4 text-success">{notice}</p>}
    {!data && !error && <Loading />}

    {total && <section aria-labelledby="dues-summary" className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="dues-summary" className="font-semibold">{t("dues.summary_title")}</h2>
        <p className="text-3xl font-semibold tabular-nums text-accent">{t("dues.paid_pct", { pct: total.paidPct })}</p>
      </div>
      <ProgressBar progress={total} label={t("dues.summary_title")} />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["dues.total_charged", total.owed, ""],
          ["dues.total_paid", total.paid, "text-accent"],
          ["dues.total_pending", total.pending, ""],
          ["dues.total_left", total.left, ""],
        ] as const).map(([key, value, tone]) => <div key={key} className="rounded-md bg-surface-2 p-3">
          <dt className="text-xs text-muted">{t(key)}</dt><dd className={`mt-1 font-semibold tabular-nums ${tone}`}>{money(value)}</dd>
        </div>)}
      </dl>
      <p className="text-xs text-muted">{t("dues.summary_hint")}</p>
    </section>}

    {settings && (settings.enabled ? <section className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <p className="text-sm text-muted">{t("dues.hint")}</p>
      <dl className="space-y-2">{[["bank", settings.bank_name], ["account", settings.account_number], ["holder", settings.account_holder]].map(([key, value]) => <div key={key}><dt className="text-xs text-muted">{t(`dues.${key}`)}</dt><dd className="break-all font-medium">{value}</dd></div>)}</dl>
      {settings.instructions && <p className="whitespace-pre-wrap text-sm">{settings.instructions}</p>}
    </section> : <p className="rounded-xl border border-line p-4 text-muted">{t("dues.unconfigured")}</p>)}
    {data?.charges.length === 0 && <p className="text-muted">{t("dues.empty")}</p>}

    {data?.charges.map(charge => {
      const progress = chargeProgress(charge);
      const parts = instalments(data.payments, charge.id);
      const counted = parts.filter(part => part.status === "approved").length;
      const left = progress.left;
      return <article key={charge.id} className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <div className="flex justify-between gap-3"><h2 className="font-semibold">{charge.period}</h2><strong className="tabular-nums">{money(charge.amount)}</strong></div>
        <ProgressBar progress={progress} label={`${charge.period} — ${t("dues.paid_pct", { pct: progress.paidPct })}`} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold tabular-nums text-accent">{t("dues.paid_pct", { pct: progress.paidPct })}</span>
          <span className="tabular-nums text-muted">{t("dues.paid")}: {money(charge.paid)}</span>
          {counted > 0 && <span className="text-muted">{t("dues.parts_paid", { count: counted })}</span>}
          {progress.pending > 0 && <span className="tabular-nums text-muted">{t("dues.total_pending")}: {money(progress.pending)}</span>}
          <span className="tabular-nums text-muted">{t("dues.balance")}: {money(charge.balance)}</span>
        </p>
        <p className="text-sm text-muted">{t("dues.due_date")}: {charge.due_date}</p>
        {charge.waived && <p className="text-sm">{t("dues.waived")}: {charge.waiver_reason}</p>}

        {parts.length > 0 && <ol className="divide-y divide-line rounded-md border border-line">
          {parts.map(part => <Instalment key={part.id} part={part} t={t} />)}
        </ol>}

        {left > 0 && report?.charge.id !== charge.id && <button disabled={busy} onClick={() => open(charge)} className="min-h-11 rounded-md border border-input px-4">{t("dues.report")}</button>}
        {left === 0 && charge.balance > 0 && <p className="rounded-md bg-surface-2 p-3 text-sm text-muted">{t("dues.awaiting_all")}</p>}

        {report?.charge.id === charge.id && <form onSubmit={submit} className="space-y-4 border-t border-line pt-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("dues.split")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{partChoices(left).map(parts => <button key={parts} type="button" onClick={() => split(parts)}
              aria-pressed={report.parts === parts}
              className={`min-h-11 rounded-md border px-2 text-sm ${report.parts === parts ? "border-accent bg-accent-soft font-semibold text-accent" : "border-input"}`}>
              {parts === 1 ? t("dues.split_one") : t("dues.split_n", { n: parts })}
            </button>)}</div>
          </fieldset>
          <label className="block space-y-1"><span className="text-sm">{t("dues.amount")}</span><input required type="number" min={1} max={left} step={1} value={report.amount} onChange={e => setReport({ ...report, amount: Number(e.target.value) })} className={`${fieldClass} w-full min-h-11 tabular-nums`} /></label>
          <p className="flex flex-wrap justify-between gap-2 rounded-md bg-surface-2 p-3 text-sm tabular-nums">
            <span>{t("dues.this_part")}: <strong>{money(Math.max(0, Math.min(report.amount || 0, left)))}</strong></span>
            <span className="text-muted">{t("dues.after_part")}: {money(Math.max(0, left - (report.amount || 0)))}</span>
          </p>
          <label className="block space-y-1"><span className="text-sm">{t("dues.reference")}</span><input required maxLength={128} value={report.reference} onChange={e => setReport({ ...report, reference: e.target.value })} className={`${fieldClass} w-full min-h-11`} /></label>
          <div className="flex gap-3"><button disabled={busy || !report.reference.trim() || !(report.amount >= 1 && report.amount <= left)} className="min-h-11 rounded-lg bg-accent px-4 text-on-accent disabled:opacity-50">{t("dues.report")}</button><button type="button" disabled={busy} onClick={() => setReport(null)} className="min-h-11 rounded-lg border border-line px-4">{t("dues.cancel")}</button></div>
        </form>}
      </article>;
    })}

    {!!data?.payments.length && <section className="space-y-3"><h2 className="text-lg font-semibold">{t("dues.history")}</h2>{data.payments.map(payment => <article key={payment.id} className="space-y-2 rounded-xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="tabular-nums">{money(payment.amount)}</strong><span className="text-sm">{t(`dues.${payment.status}`)}</span></div><p className="break-all text-sm text-muted">{payment.reference}</p>{payment.review_note && <p className="text-sm">{payment.review_note}</p>}<time className="text-xs text-muted">{memberDate(payment.created_at)}</time></article>)}</section>}
    {data?.has_more && <button disabled={busy} onClick={() => void more()} className="min-h-11 rounded-lg border border-line px-4">{t("dues.more")}</button>}
  </div>;

}
