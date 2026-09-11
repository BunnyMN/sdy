"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { duesApi, type Charge, type DuesPage, type DuesSettings } from "@/lib/api/dues";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, Loading } from "@/components/ui";

import { memberMoney as money, memberDate } from "@/lib/memberFormat";
export default function MemberDues() {
  const { t } = useI18n();
  const { allowed: finance } = useAccess("membership.finance");
  const [data, setData] = useState<DuesPage | null>(null);
  const [settings, setSettings] = useState<DuesSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ charge: Charge; amount: number; reference: string; key: string } | null>(null);
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
  return <div className="mx-auto max-w-[720px] space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{t("dues.title")}</h1>{finance && <Link className="min-h-11 rounded-lg border border-line px-4 py-3 text-sm" href="/member/finance">{t("dues.finance")}</Link>}</header>
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="rounded-xl bg-success-soft p-4 text-success">{notice}</p>}
    {!data && !error && <Loading />}
    {settings && (settings.enabled ? <section className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <p className="text-sm text-muted">{t("dues.hint")}</p>
      <dl className="space-y-2">{[["bank", settings.bank_name], ["account", settings.account_number], ["holder", settings.account_holder]].map(([key, value]) => <div key={key}><dt className="text-xs text-muted">{t(`dues.${key}`)}</dt><dd className="break-all font-medium">{value}</dd></div>)}</dl>
      {settings.instructions && <p className="whitespace-pre-wrap text-sm">{settings.instructions}</p>}
    </section> : <p className="rounded-xl border border-line p-4 text-muted">{t("dues.unconfigured")}</p>)}
    {data?.charges.length === 0 && <p className="text-muted">{t("dues.empty")}</p>}
    {data?.charges.map(charge => <article key={charge.id} className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <div className="flex justify-between gap-3"><h2 className="font-semibold">{charge.period}</h2><strong className="tabular-nums">{money(charge.amount)}</strong></div>
      <p className="text-sm text-muted">{t("dues.paid")}: {money(charge.paid)} · {t("dues.balance")}: {money(charge.balance)}</p>
      <p className="text-sm text-muted">{t("dues.due_date")}: {charge.due_date}</p>
      {charge.waived && <p className="text-sm">{t("dues.waived")}: {charge.waiver_reason}</p>}
      {charge.balance > 0 && <button disabled={busy} onClick={() => { setReport({ charge, amount: charge.balance, reference: "", key: crypto.randomUUID() }); setError(""); }} className="min-h-11 rounded-md border border-input px-4">{t("dues.report")}</button>}
      {report?.charge.id === charge.id && <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
        <label className="block space-y-1"><span className="text-sm">{t("dues.amount")}</span><input required type="number" min={1} max={charge.balance} step={1} value={report.amount} onChange={e => setReport({ ...report, amount: Number(e.target.value) })} className={`${fieldClass} w-full min-h-11`} /></label>
        <label className="block space-y-1"><span className="text-sm">{t("dues.reference")}</span><input required maxLength={128} value={report.reference} onChange={e => setReport({ ...report, reference: e.target.value })} className={`${fieldClass} w-full min-h-11`} /></label>
        <div className="flex gap-3"><button disabled={busy || !report.reference.trim()} className="min-h-11 rounded-lg bg-accent px-4 text-on-accent disabled:opacity-50">{t("dues.report")}</button><button type="button" disabled={busy} onClick={() => setReport(null)} className="min-h-11 rounded-lg border border-line px-4">{t("dues.cancel")}</button></div>
      </form>}
    </article>)}
    {!!data?.payments.length && <section className="space-y-3"><h2 className="text-lg font-semibold">{t("dues.history")}</h2>{data.payments.map(payment => <article key={payment.id} className="space-y-2 rounded-xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="tabular-nums">{money(payment.amount)}</strong><span className="text-sm">{t(`dues.${payment.status}`)}</span></div><p className="break-all text-sm text-muted">{payment.reference}</p>{payment.review_note && <p className="text-sm">{payment.review_note}</p>}<time className="text-xs text-muted">{memberDate(payment.created_at)}</time></article>)}</section>}
    {data?.has_more && <button disabled={busy} onClick={() => void more()} className="min-h-11 rounded-lg border border-line px-4">{t("dues.more")}</button>}
  </div>;
}
