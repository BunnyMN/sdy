"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { eventsApi } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";

export default function CheckinCode({ eventID }: { eventID: string }) {
  const { t } = useI18n();
  const [code, setCode] = useState<{ url: string; expires: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    const timer = window.setTimeout(() => setCode(null), Math.max(0, new Date(code.expires).getTime()-Date.now()));
    return () => window.clearTimeout(timer);
  }, [code]);
  async function issue() {
    setBusy(true); setError(""); setCode(null);
    try {
      const issued = await eventsApi.issueCheckin(eventID);
      // The fragment stays in the browser; nginx and referrers never receive
      // the bearer code. It is sent only in the authenticated POST body.
      setCode({ url: `${location.origin}/member/check-in#event=${encodeURIComponent(eventID)}&token=${encodeURIComponent(issued.token)}`, expires: issued.expires_at });
    } catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
    <button disabled={busy} onClick={() => void issue()} className="min-h-11 rounded-lg border border-line px-4 font-medium disabled:opacity-50">{t("events.checkin.issue")}</button>
    <p className="text-sm text-muted">{t("events.checkin.hint")}</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {code && <div className="space-y-2"><div className="inline-block rounded-xl bg-white p-3"><QRCodeSVG value={code.url} size={220} marginSize={2} /></div><p className="text-sm text-muted">{t("events.checkin.expires")}: {new Date(code.expires).toLocaleTimeString()}</p></div>}
  </section>;
}
