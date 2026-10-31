"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Fingerprint } from "lucide-react";
import { EID_NEXT_KEY } from "@/lib/signIn";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { safeReturnPath } from "@/lib/safeReturnPath.mjs";

/**
 * Where the sign-in continues once the eID Mongolia app hands the citizen back.
 *
 * A check-in started before signing in wins; otherwise the `next` the sign-in
 * screen was given, which EIDLogin left in sessionStorage before the phone
 * switched to the app. Both are read once and cleared.
 */
function destination() {
  let next = "/member";
  try {
    const stored = sessionStorage.getItem(EID_NEXT_KEY);
    sessionStorage.removeItem(EID_NEXT_KEY);
    next = safeReturnPath(stored, "/member");
    const raw = sessionStorage.getItem("sdy.checkin");
    if (raw && JSON.parse(raw).expires > Date.now()) return "/member/check-in";
    sessionStorage.removeItem("sdy.checkin");
  } catch { /* Login still completes when storage is unavailable. */ }
  return next;
}

export default function EIDCallback() {
  const { t } = useI18n();
  const [error, setError] = useState<TranslationKey | "">("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // A signature (a discussion vote) returns here too, carrying where it
    // started. That page picks the signature up; there is no login to finish.
    // safeReturnPath, not a prefix check: the URL parser drops tabs and
    // newlines, so "/\t/evil.example" would become "//evil.example".
    const back = safeReturnPath(params.get("return"), "");
    if (back) { location.replace(back); return; }
    const sid = params.get("sessionId") || params.get("session_id");
    if (!sid) { setError("auth.callback.missing"); return; }
    let stopped = false, running = false;
    const deadline = Date.now() + 5 * 60 * 1000;
    const tick = async () => {
      if (stopped || running) return;
      if (Date.now() > deadline) { stopped = true; setError("auth.message.expired"); return; }
      running = true;
      try {
        const res = await api.pollEID(sid);
        if (stopped) return;
        if (res.state === "COMPLETE") { stopped = true; location.replace(destination()); }
        // Two different stories: one ran out of time, the other was declined in
        // the app. Telling somebody who pressed "decline" that time ran out
        // sends them looking for a problem that is not there.
        else if (res.state === "REFUSED") { stopped = true; setError("auth.message.refused"); }
        else if (res.state === "EXPIRED") { stopped = true; setError("auth.message.expired"); }
      } catch { /* A temporary failure is retried until the request expires. */ }
      finally { running = false; }
    };
    const timer = setInterval(() => void tick(), 2000);
    void tick();
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  // The sign-in screen again, with the same destination it was first given.
  const retry = () => {
    let next = "/member";
    try { next = safeReturnPath(sessionStorage.getItem(EID_NEXT_KEY), "/member"); } catch { /* default */ }
    return `/login?next=${encodeURIComponent(next)}`;
  };

  return (
    <main className="eid-callback">
      <Fingerprint aria-hidden="true" />
      {error ? (
        <div role="alert">
          <h1>{t(error)}</h1>
          <a href={retry()}>{t("auth.callback.sign_in_again")}</a>
        </div>
      ) : (
        <div role="status">
          <h1>{t("auth.callback.checking_title")}</h1>
          <p>{t("auth.callback.checking_body")}</p>
        </div>
      )}
    </main>
  );
}
