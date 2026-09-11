"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eventsApi, type EventRecord } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading } from "@/components/ui";

export default function MemberCheckin() {
  const { t } = useI18n();
  const [code, setCode] = useState<{ id: string; token: string } | null>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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
    if (!id || !/^[a-f0-9]{48}$/.test(token)) return;
    setCode({ id, token });
    void eventsApi.get(id).then(setEvent).catch(err => setError(err instanceof Error ? err.message : "—"));
  }, []);
  async function confirm() {
    if (!code || !event) return;
    setBusy(true); setError("");
    try {
      if (!event.my_status) await eventsApi.register(code.id);
      await eventsApi.checkIn(code.id, code.token);
      setDone(true); setCode(null);
    } catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-lg space-y-5 rounded-lg border border-line bg-surface p-6">
    <h1 className="text-2xl font-semibold">{t("events.checkin.title")}</h1>
    {error && <Banner tone="error" message={error} />}
    {done ? <><p role="status" className="text-success">{t("events.checkin.success")}</p><Link href="/member/participation" className="inline-block py-3 text-accent">{t("events.participation")}</Link></>
      : !code ? <p className="text-muted">{t("events.checkin.missing")}</p>
        : !event && !error ? <Loading /> : event && <><h2 className="text-lg font-semibold">{event.title}</h2><p className="text-sm text-muted">{event.location}</p><p>{t("events.field.points")}: {event.points_value ?? 0}</p><button disabled={busy} onClick={() => void confirm()} className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("events.checkin.confirm")}</button></>}
  </div>;
}
