"use client";

import { useEffect, useState } from "react";
import { eventsApi } from "@/lib/api/events";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, Loading } from "@/components/ui";

export default function BranchActivity() {
  const { t } = useI18n();
  const { loading, allowed } = useAccess("events.manage");
  const [period, setPeriod] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`; });
  const [data, setData] = useState<Awaited<ReturnType<typeof eventsApi.summary>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (loading || !allowed || !period) return;
    let active = true; setData(null); setError("");
    void eventsApi.summary(period).then(value => { if (active) setData(value); }).catch(err => { if (active) setError(err instanceof Error ? err.message : "—"); });
    return () => { active = false; };
  }, [loading, allowed, period]);
  if (loading) return <Loading />;
  if (!allowed) return <p>{t("membership.no_access")}</p>;
  return <div className="mx-auto max-w-3xl space-y-5"><h1 className="text-2xl font-semibold">{t("events.activity.title")}</h1><p className="text-sm text-muted">{t("events.activity.hint")}</p><label className="block space-y-1"><span className="text-sm">{t("dues.period")}</span><input type="month" required min="2000-01" max="2100-12" value={period} onChange={e => setPeriod(e.target.value)} className={`${fieldClass} block min-h-11`} /></label>{error && <Banner tone="error" message={error} />}{!data && !error && <Loading />}{data && <div className="grid grid-cols-2 gap-3">{Object.entries(data).map(([key, value]) => <div key={key} className="rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-muted">{t(`events.activity.${key}`)}</p><strong className="mt-3 block text-3xl text-accent">{value}</strong></div>)}</div>}</div>;
}
