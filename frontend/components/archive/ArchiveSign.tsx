"use client";

/**
 * Архивын баримтад гарын үсэг зурах: хэлэлцүүлгийн санал болон eID туршилттай
 * ижил PIN2 ёслол. Утсан дээр eID апп шууд нээгдэж буцаж ирнэ (сесс
 * sessionStorage-д үлдэнэ), компьютер дээр баталгаажуулах код гарна. eID
 * тамгалсан PDF-ийг бэлдэж байх үед poll 502 өгч болно — хэдэн удаа хүлээгээд
 * «Дахин оролдох» санал болгоно.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Fingerprint, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";

import { archiveApi } from "@/lib/api/archive";
import { ApiError } from "@/lib/errorMessage";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { useI18n } from "@/lib/i18n";
import { formatCountdown } from "@/lib/datetime";
import { browserHint } from "@/components/EIDLogin";
import {
  ARCHIVE_POLL_502_LIMIT, ARCHIVE_POLL_EVERY, ARCHIVE_POLL_FOR, archiveCallback, archiveErrorKey,
  forgetSignSession, pollStep, readSignSession, saveSignSession,
} from "@/lib/archive";

function onPhone() { return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

type View =
  | { phase: "idle" }
  | { phase: "waiting"; code: string; onPhone: boolean; deadline: number; stamping: boolean }
  | { phase: "signed" }
  | { phase: "failed"; message: string };

export default function ArchiveSign({ documentID, onSigned }: { documentID: string; onSigned: () => void }) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [view, setView] = useState<View>({ phase: "idle" });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ticket = useRef(0);

  const explain = useCallback((err: unknown) => {
    const key = archiveErrorKey(err);
    return key ? t(key) : errorMessage(err);
  }, [t, errorMessage]);

  useEffect(() => () => { ticket.current++; }, []);
  const waiting = view.phase === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const end = useCallback((next: View) => {
    forgetSignSession(window.sessionStorage);
    setView(next);
    if (next.phase === "signed") onSigned();
  }, [onSigned]);

  /* Ask every two seconds until eID answers or five minutes pass. A 502 is
     eID (or its stamp) not ready yet: a few in a row are waited out. */
  const watch = useCallback(async (sessionID: string, deadline: number, mine: number) => {
    let gateway = 0;
    while (ticket.current === mine && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, ARCHIVE_POLL_EVERY));
      if (ticket.current !== mine) return;
      try {
        const answer = await archiveApi.poll(documentID, sessionID);
        if (ticket.current !== mine) return;
        gateway = 0;
        const step = pollStep(answer.state);
        if (step === "signed") { end({ phase: "signed" }); return; }
        if (step === "failed") { end({ phase: "failed", message: t("events.archive.sign_failed", { reason: answer.reason || answer.state }) }); return; }
      } catch (err) {
        if (ticket.current !== mine) return;
        if (err instanceof ApiError && err.status === 502 && ++gateway < ARCHIVE_POLL_502_LIMIT) {
          setView(v => v.phase === "waiting" ? { ...v, stamping: true } : v);
          continue;
        }
        end({ phase: "failed", message: explain(err) }); return;
      }
    }
    if (ticket.current === mine) end({ phase: "failed", message: t("events.archive.sign_timeout") });
  }, [documentID, end, explain, t]);

  // Back from the eID app: pick the ceremony up where it was left.
  useEffect(() => {
    const saved = readSignSession(window.sessionStorage, documentID);
    if (!saved) return;
    const mine = ++ticket.current;
    const deadline = saved.started + ARCHIVE_POLL_FOR;
    setView({ phase: "waiting", code: "", onPhone: true, deadline, stamping: false });
    void watch(saved.session_id, deadline, mine);
  }, [documentID, watch]);

  async function start() {
    setBusy(true);
    const mine = ++ticket.current;
    try {
      const phone = onPhone();
      const answer = await archiveApi.sign(documentID, phone ? archiveCallback(window.location.origin, documentID, browserHint(navigator.userAgent)) : "");
      const started = Date.now();
      const deadline = started + ARCHIVE_POLL_FOR;
      setNow(started);
      setView({ phase: "waiting", code: answer.verification_code ?? "", onPhone: phone && !!answer.app_link, deadline, stamping: false });
      if (phone && answer.app_link) {
        // The page may not survive the trip to the eID app; the session does.
        saveSignSession(window.sessionStorage, documentID, answer.session_id, started);
        window.location.href = answer.app_link;
      }
      void watch(answer.session_id, deadline, mine);
    } catch (err) {
      setView({ phase: "failed", message: explain(err) });
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    ticket.current++;
    forgetSignSession(window.sessionStorage);
    setView({ phase: "idle" });
  }

  return <section aria-labelledby="archive-sign-title" className="space-y-3 rounded-lg border border-accent bg-accent-soft/40 p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <Fingerprint aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
      <div className="min-w-0">
        <h2 id="archive-sign-title" className="font-semibold">{t("events.archive.sign")}</h2>
        <p className="mt-1 text-sm text-muted">{t("events.archive.sign_hint")}</p>
      </div>
    </div>

    {view.phase === "idle" && <button type="button" disabled={busy} onClick={() => void start()}
      className="min-h-11 rounded-md bg-accent px-5 font-medium text-on-accent disabled:opacity-50">{t("events.archive.sign")}</button>}

    {view.phase === "waiting" && <div className="space-y-3 text-center" aria-live="polite">
      <p className="text-sm">{t(view.onPhone ? "events.archive.signing_phone" : "events.archive.signing_push")}</p>
      {view.code && <><p className="text-xs text-muted">{t("events.discussion.signing_code")}</p>
        <p className="text-4xl font-bold tracking-widest tabular-nums">{view.code}</p></>}
      {view.stamping && <p className="text-xs text-muted">{t("events.archive.stamp_wait")}</p>}
      <p className="text-xs text-muted tabular-nums">{t("events.discussion.signing_wait")} <span aria-hidden="true">{formatCountdown(view.deadline - now)}</span></p>
      <button type="button" onClick={stop} className="min-h-11 rounded-md border border-input px-4">{t("events.discussion.signing_stop")}</button>
    </div>}

    {view.phase === "signed" && <p role="status" className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />{t("events.archive.signed_ok")}</p>}

    {view.phase === "failed" && <div className="space-y-2">
      <p role="alert" className="flex items-start gap-2 text-sm text-danger"><XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />{view.message}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void start()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 font-medium text-on-accent disabled:opacity-50">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />{t("events.archive.retry")}</button>
        <Link href="/member/eid-test" className="text-xs underline">{t("events.sign_test.link")}</Link>
      </div>
    </div>}
  </section>;
}
