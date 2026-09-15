"use client";

import { useCallback, useEffect, useState } from "react";
import { memberApi, type PersonalDuesHistory, type PersonalParticipationHistory } from "@/lib/api/member";
import { useI18n } from "@/lib/i18n";
import { memberDate, memberMoney } from "@/lib/memberFormat";
import { Banner, Loading } from "@/components/ui";

export default function PersonalHistoryPage() {
  const { t } = useI18n();
  const [dues, setDues] = useState<PersonalDuesHistory | null>(null);
  const [events, setEvents] = useState<PersonalParticipationHistory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const [d, e] = await Promise.all([memberApi.duesHistory(), memberApi.participationHistory()]); setDues(d); setEvents(e); setError(""); }
    catch { setError(t("membership.load_failed")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function more(kind: "dues" | "events") {
    setBusy(true);
    try {
      if (kind === "dues" && dues) { const next = await memberApi.duesHistory(dues.next_offset); setDues({ ...next, charges: [...dues.charges, ...next.charges], payments: [...dues.payments, ...next.payments] }); }
      if (kind === "events" && events) { const next = await memberApi.participationHistory(events.next_offset); setEvents({ ...next, items: [...events.items, ...next.items], entries: [...events.entries, ...next.entries] }); }
    } catch { setError(t("membership.load_failed")); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-[720px] space-y-6 pb-6">
    <header><h1>{t("membership.record.personal_history")}</h1><p className="mt-2 text-sm text-muted">{t("membership.record.personal_history_hint")}</p></header>
    {error && <Banner tone="error" message={error} />}
    {!events && (error ? <button onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button> : <Loading />)}
    {events && <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <h2>{t("membership.nav_attendance")} · {events.total_points} {t("membership.record.points_unit")}</h2>
      {!events.items.length && <p className="text-sm text-muted">{t("membership.record.empty_history")}</p>}
      <ul className="space-y-3">{events.items.map(e => <li key={e.id} className="border-b border-line pb-3"><h3 className="font-medium">{e.title}</h3><p className="text-sm text-muted">{e.branch} · {memberDate(e.starts_at)}</p><p className="text-sm">{t(`events.attendance.${e.status}`)} · {e.points} {t("membership.record.points_unit")}</p></li>)}</ul>
      <h3 className="font-medium">{t("membership.record.point_history")}</h3>
      <ul className="space-y-3">{events.entries.map(e => <li key={e.id} className="text-sm"><p>{e.title} · <strong>{e.delta > 0 ? "+" : ""}{e.delta}</strong></p><p className="text-muted">{e.branch} · {memberDate(e.created_at)}</p></li>)}</ul>
      {events.has_more && <button disabled={busy} onClick={() => void more("events")} className="min-h-11 rounded-md border border-input px-4">{t("membership.record.more")}</button>}
    </section>}
    {dues && <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <h2>{t("dues.title")}</h2>
      {!dues.charges.length && <p className="text-sm text-muted">{t("dues.empty")}</p>}
      <ul className="space-y-3">{dues.charges.map(c => <li key={c.id} className="space-y-1 border-b border-line pb-3"><h3 className="font-medium">{c.branch} · {c.period}</h3><p className="text-sm">{t("dues.amount")}: {memberMoney(c.amount)} · {t("dues.paid")}: {memberMoney(c.paid)}</p><p className="text-sm">{c.waived ? t("dues.waived") : `${t("dues.balance")}: ${memberMoney(c.balance)}`}</p></li>)}</ul>
      <h3 className="font-medium">{t("dues.history")}</h3>
      <ul className="space-y-3">{dues.payments.map(p => <li key={p.id} className="space-y-1 text-sm"><p>{p.branch} · <strong>{memberMoney(p.amount)}</strong></p><p>{t(`dues.${p.status}`)} · {memberDate(p.created_at)}</p><p className="break-words text-muted">{p.reference}{p.review_note && ` · ${p.review_note}`}</p></li>)}</ul>
      {dues.has_more && <button disabled={busy} onClick={() => void more("dues")} className="min-h-11 rounded-md border border-input px-4">{t("membership.record.more")}</button>}
    </section>}
  </div>;
}
