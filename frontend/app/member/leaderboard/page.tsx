"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, CalendarCheck, ClipboardCheck, Medal, Trophy, Vote } from "lucide-react";
import { participationApi, type LeaderboardPeriod, type Standing } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Banner, LoadingBlock } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";

const periods: LeaderboardPeriod[] = ["month", "year", "all"];
// Gold, silver, bronze, in the theme's own tones so they hold in dark mode.
const podium = ["text-warning", "text-subtle", "text-accent"];

/** The branch's members ranked by the points their participation earned. */
export default function LeaderboardPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [data, setData] = useState<{ standings: Standing[]; me: Standing | null } | null>(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(0);
  const retry = useCallback(() => setRound(n => n + 1), []);

  useEffect(() => {
    let live = true;
    setData(null); setError("");
    participationApi.leaderboard(period)
      .then(r => { if (live) setData(r); })
      .catch(err => { if (live) setError(errorMessage(err)); });
    return () => { live = false; };
  }, [period, round, errorMessage]);

  // Each count says what it counts in words as well as an icon: a title
  // attribute is not read on touch screens and not reliably by screen readers.
  const counts = (s: Standing) => <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
    <span className="inline-flex items-center gap-1"><CalendarCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("events.leaderboard.attended")} {s.attended}</span>
    <span className="inline-flex items-center gap-1"><ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />{t("events.leaderboard.tasks")} {s.tasks}</span>
    <span className="inline-flex items-center gap-1"><Vote aria-hidden="true" className="h-3.5 w-3.5" />{t("events.leaderboard.votes")} {s.votes}</span>
  </span>;

  return <div className="mx-auto max-w-[720px] space-y-5">
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Trophy className="h-6 w-6 text-accent" />{t("events.leaderboard.title")}</h1>
      <p className="text-sm text-muted">{t("events.leaderboard.hint")}</p>
    </header>

    <div role="group" aria-label={t("events.leaderboard.period")} className="grid grid-cols-3 gap-2">
      {periods.map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
        className={`min-h-11 rounded-md border px-3 text-sm ${period === p ? "border-accent bg-accent-soft font-semibold text-accent" : "border-input"}`}>
        {t(`events.leaderboard.${p}`)}
      </button>)}
    </div>

    {error && <><Banner tone="error" message={error} /><button type="button" onClick={retry} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button></>}
    {!data && !error && <LoadingBlock />}

    {data && <section aria-label={t("events.leaderboard.me")} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Award aria-hidden="true" className="h-7 w-7" /></span>
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
          <span className="relative grid h-9 w-9 shrink-0 place-items-center text-sm font-semibold tabular-nums text-muted">
            {s.rank <= 3 && <Medal aria-hidden="true" className={`absolute inset-0 h-9 w-9 ${podium[s.rank - 1]}`} />}
            <span className={s.rank <= 3 ? "relative mt-2 text-2xs font-bold text-foreground" : ""}>
              <span className="sr-only">{t("events.leaderboard.rank", { rank: s.rank })}</span><span aria-hidden="true">{s.rank}</span>
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <strong className={`block truncate ${mine ? "text-accent" : "text-foreground"}`}>{s.name || "—"}</strong>
            {counts(s)}
          </span>
          <strong className="text-lg tabular-nums">{s.points}<span className="sr-only"> {t("events.leaderboard.points").toLowerCase()}</span></strong>
        </li>;
      })}
    </ol>}
  </div>;
}
