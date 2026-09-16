"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eventsApi } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading } from "@/components/ui";

import { memberDate } from "@/lib/memberFormat";

type Participation = Awaited<ReturnType<typeof eventsApi.mine>>;
type Points = Awaited<ReturnType<typeof eventsApi.points>>;

export default function ParticipationPage() {
  const { t } = useI18n();
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [points, setPoints] = useState<Points | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([eventsApi.mine(), eventsApi.points()]).then(([activity, score]) => { setParticipation(activity); setPoints(score); }).catch(err => setError(err instanceof Error ? err.message : "—"));
  }, []);
  async function more(kind: "activity" | "points") {
    setBusy(true); setError("");
    try {
      if (kind === "activity" && participation) {
        const next = await eventsApi.mine(participation.next_offset);
        setParticipation({ ...next, items: [...participation.items, ...next.items] });
      } else if (points) {
        const next = await eventsApi.points(points.next_offset);
        setPoints({ ...next, entries: [...points.entries, ...next.entries] });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-[720px] space-y-5">
    <h1 className="text-2xl font-semibold">{t("events.participation")}</h1>
    {error && <Banner tone="error" message={error} />}
    {!participation && !error && <Loading />}
    {points && <div className="rounded-lg border border-line bg-surface p-4 sm:p-6"><p className="text-sm text-muted">{t("events.points.total")}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{points.total}</p></div>}
    {participation?.items.length === 0 && <p className="text-muted">{t("events.points.empty")}</p>}
    {participation?.items.map(item => <Link key={item.event_id} href={`/module/events/${item.event_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"><span><strong className="block">{item.title}</strong><small className="text-muted">{t(`events.attendance.${item.status}`)}</small></span><strong className="tabular-nums">{item.points}</strong></Link>)}
    {participation?.has_more && <button disabled={busy} onClick={() => void more("activity")} className="min-h-11 rounded-lg border border-line px-4">{t("events.more")}</button>}
    {points && points.entries.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">{t("events.points.history")}</h2>{points.entries.map(entry => <div key={entry.id} className="flex justify-between gap-3 rounded-xl border border-line p-4"><span>{entry.title}<small className="block text-muted">{memberDate(entry.created_at)}</small></span><strong>{entry.delta > 0 ? "+" : ""}{entry.delta}</strong></div>)}{points.has_more && <button disabled={busy} onClick={() => void more("points")} className="min-h-11 rounded-lg border border-line px-4">{t("events.more")}</button>}</section>}
  </div>;
}
