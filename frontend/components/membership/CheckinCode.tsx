"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Maximize2, QrCode, RefreshCw, X } from "lucide-react";
import { eventsApi } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { formatCountdown, formatMoment } from "@/lib/datetime";
import { ErrorNote, useDialogFocus } from "@/components/ui";

/**
 * A new code is fetched in the old one's last seconds. Not earlier: the server
 * keeps one code per event (events_events.checkin_hash), so issuing replaces
 * it, and a member who scanned the old code and is still signing in would be
 * told it is invalid while it had minutes left.
 */
const RENEW_BEFORE = 2_000; // two ticks of the 1 s clock, so one always lands in it

type Code = { url: string; expires: number };

/**
 * The organiser's check-in QR.
 *
 * It renews itself as it expires while the screen is open,
 * and can be blown up to fill the screen for a room to scan from a distance.
 * If a renewal fails the code is let run out and the screen says so plainly,
 * with the button to try again, rather than showing a QR that no longer works.
 */
export default function CheckinCode({ eventID }: { eventID: string }) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [code, setCode] = useState<Code | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [large, setLarge] = useState(false);
  const [spoken, setSpoken] = useState("");

  const issue = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const issued = await eventsApi.issueCheckin(eventID);
      // The fragment stays in the browser; nginx and referrers never receive
      // the bearer code. It is sent only in the authenticated POST body.
      setCode({ url: `${location.origin}/member/check-in#event=${encodeURIComponent(eventID)}&token=${encodeURIComponent(issued.token)}`, expires: new Date(issued.expires_at).getTime() });
      setExpired(false);
      setSpoken(t("events.checkin.renewed"));
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }, [eventID, errorMessage, t]);

  // One tick a second while a code is showing; the countdown is drawn from it.
  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [code]);

  const left = code ? code.expires - now : 0;
  const renewing = useRef(false);
  useEffect(() => {
    if (!code) return;
    if (left <= 0) { setCode(null); setExpired(true); setSpoken(t("events.checkin.expired")); return; }
    // Announced once at the minute, not every second: a live region that
    // talks every second makes the page unusable with a screen reader.
    if (left <= 60_000 && left > 59_000) setSpoken(t("events.checkin.one_minute"));
    if (left <= RENEW_BEFORE && !renewing.current && !busy && !error) {
      renewing.current = true;
      void issue().finally(() => { renewing.current = false; });
    }
  }, [code, left, busy, error, issue, t]);

  return <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-labelledby={`checkin-${eventID}`}>
    <h2 id={`checkin-${eventID}`} className="flex items-center gap-2 text-sm font-semibold"><QrCode aria-hidden="true" className="h-4 w-4" />{t("events.checkin.issue")}</h2>
    <p className="text-sm text-muted">{t("events.checkin.hint")}</p>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{spoken}</p>
    {error && <ErrorNote>{error}</ErrorNote>}
    {expired && !code && <p role="status" className="rounded-md bg-warning-soft p-3 text-sm text-warning">{t("events.checkin.expired")}</p>}
    {code && <div className="space-y-2">
      <button type="button" onClick={() => setLarge(true)} aria-label={t("events.checkin.enlarge")} className="inline-block rounded-xl bg-white p-3">
        <QRCodeSVG value={code.url} size={220} marginSize={2} />
      </button>
      <p className="text-sm text-muted tabular-nums">
        <span aria-hidden="true">{t("events.checkin.left", { time: formatCountdown(left) })} · </span>
        {t("events.checkin.expires")}: {formatMoment(code.expires).slice(11)}
      </p>
    </div>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void issue()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 font-medium disabled:opacity-50">
        <RefreshCw aria-hidden="true" className={`h-4 w-4${busy ? " animate-spin" : ""}`} />{code || expired ? t("events.checkin.new_qr") : t("events.checkin.issue")}
      </button>
      {code && <button type="button" onClick={() => setLarge(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 font-medium">
        <Maximize2 aria-hidden="true" className="h-4 w-4" />{t("events.checkin.enlarge")}
      </button>}
    </div>
    {large && code && <LargeCode url={code.url} left={left} onClose={() => setLarge(false)} />}
  </section>;
}

/** The QR as large as the screen allows, on white, for a room to scan. */
function LargeCode({ url, left, onClose }: { url: string; left: number; onClose: () => void }) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialogFocus(panel, { onEscape: onClose });
  return <div ref={panel} role="dialog" aria-modal="true" aria-label={t("events.checkin.enlarge")} tabIndex={-1} onKeyDown={onKeyDown}
    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-4 text-black">
    <button type="button" onClick={onClose} aria-label={t("base.action.close")} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-md border border-black/20">
      <X aria-hidden="true" className="h-5 w-5" />
    </button>
    <QRCodeSVG value={url} marginSize={2} style={{ width: "min(80vw, 80vh)", height: "min(80vw, 80vh)" }} />
    <p className="text-lg font-semibold tabular-nums" aria-hidden="true">{t("events.checkin.left", { time: formatCountdown(left) })}</p>
  </div>;
}
