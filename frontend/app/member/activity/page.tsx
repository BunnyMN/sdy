"use client";

import { useEffect, useState } from "react";
import { eventsApi } from "@/lib/api/events";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, LoadingBlock } from "@/components/ui";
import { monthOf } from "@/lib/datetime";
import { useErrorMessage } from "@/lib/useErrorMessage";

export default function BranchActivity() {
  const { t } = useI18n();
  const { loading, allowed } = useAccess("events.manage");
  const errorMessage = useErrorMessage();
  const [period, setPeriod] = useState(() => monthOf());
  const [round, setRound] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof eventsApi.summary>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (loading || !allowed || !period) return;
    let active = true; setData(null); setError("");
    void eventsApi.summary(period).then(value => { if (active) setData(value); }).catch(err => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [loading, allowed, period, round, errorMessage]);
  if (loading) return <LoadingBlock />;
  if (!allowed) return <p>{t("membership.no_access")}</p>;
  return <div className="mx-auto max-w-[720px] space-y-5"><h1 className="text-2xl font-semibold">{t("events.activity.title")}</h1><p className="text-sm text-muted">{t("events.activity.hint")}</p><label className="block space-y-1"><span className="text-sm">{t("dues.period")}</span><input type="month" required min="2000-01" max="2100-12" value={period} onChange={e => setPeriod(e.target.value)} className={`${fieldClass} block min-h-11`} /></label>{error && <><Banner tone="error" message={error} /><button type="button" onClick={() => setRound(n => n + 1)} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button></>}{!data && !error && <LoadingBlock />}{data && <div className="grid grid-cols-2 gap-3">{Object.entries(data).map(([key, value]) => <div key={key} className="rounded-lg border border-line bg-surface p-4 sm:p-6"><p className="text-sm text-muted">{t(`events.activity.${key}`)}</p><strong className="mt-3 block text-3xl font-semibold tabular-nums text-foreground">{value}</strong></div>)}</div>}</div>;
}
