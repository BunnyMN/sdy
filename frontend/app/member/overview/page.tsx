"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { memberApi, type MemberSummary } from "@/lib/api/member";
import { eventsApi } from "@/lib/api/events";
import { duesApi } from "@/lib/api/dues";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { memberMoney } from "@/lib/memberFormat";
import { Banner, fieldClass, Loading } from "@/components/ui";

export default function OverviewPage() {
  const { t } = useI18n();
  const access = useAccess("membership.manage");
  const eventsAccess = useAccess("events.manage");
  const financeAccess = useAccess("membership.finance");
  const [period, setPeriod] = useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
  });
  const [members, setMembers] = useState<MemberSummary | null>(null);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof eventsApi.summary>> | null>(null);
  const [finance, setFinance] = useState<Awaited<ReturnType<typeof duesApi.finance>>["totals"] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (access.loading || eventsAccess.loading || financeAccess.loading || !access.allowed || !period) return;
    let active = true;
    setMembers(null); setEvents(null); setFinance(null); setError("");
    void Promise.all([memberApi.summary(), eventsAccess.allowed ? eventsApi.summary(period) : null, financeAccess.allowed ? duesApi.finance(period) : null])
      .then(([m, e, f]) => { if (active) { setMembers(m); setEvents(e); setFinance(f?.totals ?? null); } })
      .catch(() => { if (active) setError(t("membership.load_failed")); });
    return () => { active = false; };
  }, [access.loading, access.allowed, eventsAccess.loading, eventsAccess.allowed, financeAccess.loading, financeAccess.allowed, period, t]);
  if (access.loading) return <Loading />;
  if (!access.allowed) return <p>{t("membership.no_access")}</p>;
  const cards = (values: Record<string, number | null>, prefix: string, money = false) => <dl className="grid grid-cols-2 gap-3">{Object.entries(values).filter(([, value]) => value !== null).map(([key, value]) => <div key={key} className="rounded-lg border border-line bg-surface p-4 sm:p-6"><dt className="text-sm text-muted">{t(`${prefix}.${key}`)}</dt><dd className="mt-3 break-words text-2xl font-semibold tabular-nums">{money ? memberMoney(value!) : value}</dd></div>)}</dl>;
  return <div className="mx-auto max-w-[720px] space-y-6 pb-6">
    <h1>{t("membership.record.overview")}</h1>
    {error && <Banner tone="error" message={error} />}
    {!members && !error && <Loading />}
    {members && <section className="space-y-3"><h2>{t("membership.record.current_members")}</h2>{cards({ ...members }, "membership.record.summary")}<Link href="/member/members" className="inline-flex min-h-11 items-center text-accent underline">{t("membership.record.members")}</Link></section>}
    <label className="block space-y-2"><span>{t("dues.period")}</span><input type="month" required min="2000-01" max="2100-12" value={period} onChange={e => setPeriod(e.target.value)} className={`${fieldClass} block min-h-11`} /></label>
    {events && <section className="space-y-3"><h2>{t("events.activity.title")}</h2><p className="text-sm text-muted">{t("events.activity.hint")}</p>{cards(events, "events.activity")}</section>}
    {finance && <section className="space-y-3"><h2>{t("dues.finance")}</h2>{cards(finance, "membership.record.finance", true)}</section>}
  </div>;
}
