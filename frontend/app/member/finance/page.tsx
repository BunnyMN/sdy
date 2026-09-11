"use client";

import { useCallback, useEffect, useState } from "react";
import { duesApi, type DuesSettings, type FinancePage } from "@/lib/api/dues";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, Loading } from "@/components/ui";

type Decision = { id: string; action: "approve" | "reject" | "reverse" | "waive"; title: string; reason: string };
const button = "min-h-11 rounded-lg border border-line px-4 disabled:opacity-50";
import { memberMoney as money } from "@/lib/memberFormat";

export default function DuesFinance() {
  const { t } = useI18n();
  const { allowed, loading } = useAccess("membership.finance");
  const [period, setPeriod] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; });
  const [data, setData] = useState<FinancePage | null>(null);
  const [settings, setSettings] = useState<DuesSettings | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const next = await duesApi.finance(period); setData(next); }, [period]);
  useEffect(() => {
    if (!loading && allowed) void duesApi.settings().then(setSettings).catch(err => setError(err instanceof Error ? err.message : "—"));
  }, [loading, allowed]);
  useEffect(() => {
    if (!loading && allowed && period) { let active = true; setData(null); void duesApi.finance(period).then(next => { if (active) setData(next); }).catch(err => { if (active) setError(err instanceof Error ? err.message : "—"); }); return () => { active = false; }; }
  }, [loading, allowed, period]);
  async function act(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  function save(event: React.FormEvent) {
    event.preventDefault(); if (!settings) return;
    void act(async () => { setSettings(await duesApi.saveSettings(settings)); setNotice(t("dues.saved")); });
  }
  function review(event: React.FormEvent) {
    event.preventDefault(); if (!decision) return;
    void act(async () => {
      if (decision.action === "waive") await duesApi.waive(decision.id, decision.reason.trim());
      else await duesApi.review(decision.id, decision.action, decision.reason.trim());
      setDecision(null); setNotice(t("dues.saved")); await load();
    });
  }
  if (loading) return <Loading />;
  if (!allowed) return <p>{t("dues.no_access")}</p>;
  return <div className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-semibold">{t("dues.finance")}</h1>
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="rounded-xl bg-success-soft p-4 text-success">{notice}</p>}
    {settings && <details className="rounded-lg border border-line bg-surface p-4 sm:p-6" open={!settings.enabled}>
      <summary className="cursor-pointer font-semibold">{t("dues.settings")}</summary>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />{t("dues.enabled")}</label>
        <div className="grid gap-4 sm:grid-cols-2">{([
          ["monthly_amount", "monthly", "number", 1_000_000_000], ["due_day", "due_day", "number", 28],
          ["bank_name", "bank", "text", 100], ["account_number", "account", "text", 64], ["account_holder", "holder", "text", 200],
        ] as const).map(([key, label, type, limit]) => <label key={key} className="block space-y-1"><span className="text-sm">{t(`dues.${label}`)}</span><input required={settings.enabled || type === "number"} type={type} min={key === "monthly_amount" ? 0 : 1} max={type === "number" ? limit : undefined} step={type === "number" ? 1 : undefined} maxLength={type === "text" ? limit : undefined} value={settings[key]} onChange={e => setSettings({ ...settings, [key]: type === "number" ? Number(e.target.value) : e.target.value })} className={`${fieldClass} w-full min-h-11`} /></label>)}</div>
        <label className="block space-y-1"><span className="text-sm">{t("dues.instructions")}</span><textarea maxLength={2000} rows={3} value={settings.instructions} onChange={e => setSettings({ ...settings, instructions: e.target.value })} className={`${fieldClass} w-full`} /></label>
        <button disabled={busy} className={button}>{t("dues.save")}</button>
      </form>
    </details>}
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <label className="block space-y-1"><span className="text-sm">{t("dues.period")}</span><input required type="month" min="2000-01" max="2100-12" value={period} disabled={busy} onChange={e => { setPeriod(e.target.value); setDecision(null); setNotice(""); }} className={`${fieldClass} block min-h-11`} /></label>
      <p className="text-sm text-muted">{t("dues.charge_hint")}</p>
      <button disabled={busy || !settings?.enabled || !period} onClick={() => void act(async () => { const result = await duesApi.charge(period); setNotice(t("dues.created", { count: result.created })); await load(); })} className={button}>{t("dues.create")}</button>
    </section>
    {!data && !error && <Loading />}
    {data && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(data.totals).map(([key, value]) => <div key={key} className="rounded-xl border border-line p-4"><p className="text-xs text-muted">{t(`dues.${key}`)}</p><strong className="mt-2 block break-words">{money(value)}</strong></div>)}</div>}
    {decision && <form onSubmit={review} className="space-y-3 rounded-lg border border-accent bg-surface p-4 sm:p-6">
      <h2 className="font-semibold">{t(`dues.${decision.action}`)} · {decision.title}</h2>
      <label className="block space-y-1"><span className="text-sm">{t("dues.reason")}</span><textarea required autoFocus maxLength={500} rows={3} value={decision.reason} onChange={e => setDecision({ ...decision, reason: e.target.value })} className={`${fieldClass} w-full`} /></label>
      <div className="flex flex-wrap gap-3"><button disabled={busy || !decision.reason.trim()} className={button}>{t("dues.save")}</button><button type="button" disabled={busy} onClick={() => setDecision(null)} className={button}>{t("dues.cancel")}</button></div>
    </form>}
    {!!data?.payments.length && <section className="space-y-3"><h2 className="text-lg font-semibold">{t("dues.history")}</h2><p className="text-sm text-muted">{t("dues.review_hint")}</p>{data.payments.map(payment => <article key={payment.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap justify-between gap-2"><strong>{payment.name} · {money(payment.amount)}</strong><span className="text-sm">{t(`dues.${payment.status}`)}</span></div><p className="break-all text-sm">{payment.reference}</p>{payment.review_note && <p className="text-sm text-muted">{payment.review_note}</p>}
      <div className="flex flex-wrap gap-3">{(payment.status === "pending" ? ["approve", "reject"] as const : payment.status === "approved" ? ["reverse"] as const : []).map(action => <button key={action} disabled={busy} className={button} onClick={() => setDecision({ id: payment.id, action, title: `${payment.name} · ${money(payment.amount)}`, reason: "" })}>{t(`dues.${action}`)}</button>)}</div>
    </article>)}</section>}
    {!!data?.charges.length && <section className="space-y-3"><h2 className="text-lg font-semibold">{t("dues.charged")}</h2>{data.charges.map(charge => <article key={charge.id} className="space-y-3 rounded-xl border border-line p-4"><h3 className="font-medium">{charge.name} · {charge.period}</h3><p className="text-sm text-muted">{t("dues.paid")}: {money(charge.paid)} · {t("dues.balance")}: {money(charge.balance)}</p>{charge.waived && <p className="text-sm">{t("dues.waived")}: {charge.waiver_reason}</p>}{charge.balance > 0 && <button disabled={busy} className={button} onClick={() => setDecision({ id: charge.id, action: "waive", title: `${charge.name} · ${charge.period}`, reason: "" })}>{t("dues.waive")}</button>}</article>)}</section>}
    {data?.has_more && <button disabled={busy} className={button} onClick={() => void act(async () => { const next = await duesApi.finance(period, data.next_offset); setData({ ...next, charges: [...data.charges, ...next.charges], payments: [...data.payments, ...next.payments] }); })}>{t("dues.more")}</button>}
  </div>;
}
