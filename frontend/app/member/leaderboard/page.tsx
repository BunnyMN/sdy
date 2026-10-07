"use client";

import { useEffect, useState } from "react";
import { Award, CalendarCheck, ClipboardCheck, Medal, Trophy, Vote } from "lucide-react";
import { participationApi, type LeaderboardPeriod, type Standing } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading } from "@/components/ui";

const periods: LeaderboardPeriod[] = ["month", "year", "all"];
const podium = ["text-amber-500", "text-slate-400", "text-orange-700"];

/** The branch's members ranked by the points their participation earned. */
export default function LeaderboardPage() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [data, setData] = useState<{ standings: Standing[]; me: Standing | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setData(null); setError("");
    participationApi.leaderboard(period)
      .then(r => { if (live) setData(r); })
      .catch(err => { if (live) setError(err instanceof Error ? err.message : "—"); });
    return () => { live = false; };
  }, [period]);

  const counts = (s: Standing) => <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    <span className="inline-flex items-center gap-1" title={t("events.leaderboard.attended")}><CalendarCheck className="h-3.5 w-3.5" />{s.attended}</span>
    <span className="inline-flex items-center gap-1" title={t("events.leaderboard.tasks")}><ClipboardCheck className="h-3.5 w-3.5" />{s.tasks}</span>
    <span className="inline-flex items-center gap-1" title={t("events.leaderboard.votes")}><Vote className="h-3.5 w-3.5" />{s.votes}</span>
  </span>;

  return <div className="mx-auto max-w-[720px] space-y-5">
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Trophy className="h-6 w-6 text-accent" />{t("events.leaderboard.title")}</h1>
      <p className="text-sm text-muted">{t("events.leaderboard.hint")}</p>
    </header>

    <div role="radiogroup" aria-label={t("events.leaderboard.title")} className="grid grid-cols-3 gap-2">
      {periods.map(p => <button key={p} role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}
        className={`min-h-11 rounded-md border px-3 text-sm ${period === p ? "border-accent bg-accent-soft font-semibold text-accent" : "border-input"}`}>
        {t(`events.leaderboard.${p}`)}
      </button>)}
    </div>

    {error && <Banner tone="error" message={error} />}
    {!data && !error && <Loading />}

    {data && <section aria-label={t("events.leaderboard.me")} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Award className="h-7 w-7" /></span>
      {data.me ? <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{t("events.leaderboard.me")}</p>
        <p className="text-2xl font-semibold tabular-nums">{t("events.leaderboard.rank", { rank: data.me.rank })} · <span className="text-accent">{data.me.points}</span> <span className="text-base font-normal text-muted">{t("events.leaderboard.points").toLowerCase()}</span></p>
        {counts(data.me)}
      </div> : <p className="text-sm text-muted">{t("events.leaderboard.not_ranked")}</p>}
    </section>}

    {data?.standings.length === 0 && <p className="text-muted">{t("events.leaderboard.empty")}</p>}

    {!!data?.standings.length && <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {data.standings.map(s => {
        const mine = s.user_id === data.me?.user_id;
        return <li key={s.user_id} aria-current={mine ? "true" : undefined} className={`flex items-center gap-3 px-4 py-3 ${mine ? "bg-accent-soft" : ""}`}>
          <span className="grid w-9 shrink-0 place-items-center text-sm font-semibold tabular-nums text-muted">
            {s.rank <= 3 ? <Medal className={`h-6 w-6 ${podium[s.rank - 1]}`} aria-label={String(s.rank)} /> : s.rank}
          </span>
          <span className="min-w-0 flex-1">
            <strong className={`block truncate ${mine ? "text-accent" : "text-foreground"}`}>{s.name || "—"}</strong>
            {counts(s)}
          </span>
          <strong className="text-lg tabular-nums">{s.points}</strong>
        </li>;
      })}
    </ol>}
  </div>;
}
