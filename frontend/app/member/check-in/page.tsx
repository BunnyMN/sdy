"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { eventsApi, type EventRecord } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { formatMoment } from "@/lib/datetime";
import { Banner, LoadingBlock } from "@/components/ui";

// The sentences the check-in route sends that the platform does not already know.
const CHECKIN_CODES = { "this event is closed": "events.checkin.closed" };

export default function MemberCheckin() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage({ codes: CHECKIN_CODES });
  const [code, setCode] = useState<{ id: string; token: string } | null>(null);
  // The link was a check-in link, but not one this screen can use.
  const [malformed, setMalformed] = useState(false);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ points: number; changed: boolean } | null>(null);

  const loadEvent = useCallback((id: string) => {
    setError("");
    eventsApi.get(id).then(setEvent).catch(err => setError(errorMessage(err)));
  }, [errorMessage]);

  useEffect(() => {
    let fragment = location.hash;
    try {
      const saved = sessionStorage.getItem("sdy.checkin");
      sessionStorage.removeItem("sdy.checkin");
      if (!fragment && saved) {
        const pending = JSON.parse(saved);
        if (pending.expires > Date.now()) fragment = pending.fragment;
      }
    } catch { /* A direct QR works even if browser storage is unavailable. */ }
    const params = new URLSearchParams(fragment.replace(/^#/, ""));
    const id = params.get("event") ?? "", token = params.get("token") ?? "";
    history.replaceState(null, "", location.pathname);
    if (!id && !token) return;
    if (!id || !/^[a-f0-9]{48}$/.test(token)) { setMalformed(true); return; }
    setCode({ id, token });
    loadEvent(id);
  }, [loadEvent]);

  async function confirm() {
    if (!code || !event) return;
    setBusy(true); setError("");
    try {
      if (!event.my_status) await eventsApi.register(code.id);
      const answer = await eventsApi.checkIn(code.id, code.token);
      setDone({ points: answer.changed ? answer.points ?? event.points_value ?? 0 : 0, changed: answer.changed }); setCode(null);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-lg space-y-5 rounded-lg border border-line bg-surface p-6">
    <h1 className="text-2xl font-semibold">{t("events.checkin.title")}</h1>
    {error && <Banner tone="error" message={error} />}
    {error && code && !event && <button type="button" onClick={() => loadEvent(code.id)} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button>}
    {done ? <div role="status" className="space-y-3">
      <p className="flex items-center gap-2 text-lg font-semibold text-success"><CheckCircle2 aria-hidden="true" className="h-6 w-6" />{t(done.changed ? "events.checkin.success" : "events.checkin.already")}</p>
      {done.points > 0 && <p className="text-2xl font-semibold tabular-nums text-accent">{t("events.checkin.points_earned", { points: done.points })}</p>}
      <Link href="/member/participation" className="inline-flex min-h-11 items-center text-accent underline">{t("events.participation")}</Link>
    </div>
      : malformed ? <Banner tone="warning" message={t("events.checkin.bad_link")} />
      : !code ? <p className="text-muted">{t("events.checkin.missing")}</p>
        : !event ? (!error && <LoadingBlock rows={2} />) : <>
          <h2 className="text-lg font-semibold">{event.title}</h2>
          <p className="text-sm text-muted tabular-nums">{formatMoment(event.starts_at)}{event.location ? ` · ${event.location}` : ""}</p>
          <p>{t("events.field.points")}: <strong className="tabular-nums">{event.points_value ?? 0}</strong></p>
          <button disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()} className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("events.checkin.confirm")}</button>
        </>}
  </div>;
}
