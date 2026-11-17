"use client";

/**
 * eID гарын үсгийн (PIN2) туршилт: хэлэлцүүлгийн санал өгөхтэй яг ижил eID
 * ёслолыг хор хөнөөлгүй баримт дээр ажиллуулж, хаана зогссоныг болон eID-ийн
 * өгсөн алдааны текстийг гишүүнд харуулна. Гишүүн тэр текстийг хуулж бидэнд
 * илгээнэ.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clipboard, Fingerprint, RotateCcw, XCircle } from "lucide-react";

import { signTestApi, type SignTestAnswer } from "@/lib/api/events";
import { ApiError } from "@/lib/errorMessage";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { useI18n } from "@/lib/i18n";
import { formatCountdown } from "@/lib/datetime";
import { browserHint } from "@/components/EIDLogin";
import {
  SIGN_TEST_POLL_EVERY, SIGN_TEST_POLL_FOR, forgetSession, readSavedSession, reportText, saveSession, signTestCallback, stageKey,
} from "@/lib/eidSignTest";

function onPhone() { return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

type Result = { ok: boolean; stage: string; detail: string; eidState?: string };
type View =
  | { phase: "idle" }
  | { phase: "waiting"; code: string; onPhone: boolean; deadline: number }
  | { phase: "done"; result: Result };

export default function EIDSignTest() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [view, setView] = useState<View>({ phase: "idle" });
  const [mode, setMode] = useState<SignTestAnswer["mode"]>();
  const [session, setSession] = useState("");
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ticket = useRef(0);

  useEffect(() => () => { ticket.current++; }, []);
  const waiting = view.phase === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const finish = useCallback((result: Result) => {
    forgetSession(window.sessionStorage);
    setView({ phase: "done", result });
  }, []);

  /* Ask every two seconds until eID answers or five minutes pass. One test at
     a time: a newer one takes the ticket and the older loop stops. */
  const watch = useCallback(async (sessionID: string, deadline: number, mine: number) => {
    while (ticket.current === mine && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, SIGN_TEST_POLL_EVERY));
      if (ticket.current !== mine) return;
      try {
        const answer = await signTestApi.poll(sessionID);
        if (ticket.current !== mine) return;
        if (answer.mode) setMode(answer.mode);
        if (answer.session_id) setSession(answer.session_id);
        const d = answer.diagnostic;
        if (d.state === "signed") { finish({ ok: true, stage: d.stage, detail: d.detail }); return; }
        if (d.state === "failed") { finish({ ok: false, stage: d.stage, detail: d.detail, eidState: d.eid_state }); return; }
      } catch (err) {
        if (ticket.current !== mine) return;
        if (err instanceof ApiError && err.status === 404) { finish({ ok: false, stage: "session_missing", detail: err.message }); return; }
        finish({ ok: false, stage: "network", detail: errorMessage(err) }); return;
      }
    }
    if (ticket.current === mine) finish({ ok: false, stage: "timeout", detail: "no answer from eID within 5 minutes; eID poll errors are only in the server log" });
  }, [errorMessage, finish]);

  // Back from the eID app: pick the test up where it was left.
  useEffect(() => {
    const saved = readSavedSession(window.sessionStorage);
    if (!saved) return;
    const mine = ++ticket.current;
    setSession(saved.session_id);
    const deadline = saved.started + SIGN_TEST_POLL_FOR;
    setView({ phase: "waiting", code: "", onPhone: true, deadline });
    void watch(saved.session_id, deadline, mine);
  }, [watch]);

  async function start() {
    setFailed(""); setCopied(false); setBusy(true);
    const mine = ++ticket.current;
    try {
      const phone = onPhone();
      const answer = await signTestApi.start(phone ? signTestCallback(window.location.origin, browserHint(navigator.userAgent)) : "");
      if (answer.mode) setMode(answer.mode);
      const d = answer.diagnostic;
      if (d.state !== "signing" || !answer.session_id) {
        finish({ ok: false, stage: d.stage, detail: d.detail, eidState: d.eid_state });
        return;
      }
      const started = Date.now();
      const deadline = started + SIGN_TEST_POLL_FOR;
      setSession(answer.session_id); setNow(started);
      setView({ phase: "waiting", code: answer.verification_code ?? "", onPhone: phone && !!answer.app_link, deadline });
      if (phone && answer.app_link) {
        // The page may not survive the trip to the eID app; the session does.
        saveSession(window.sessionStorage, answer.session_id, started);
        window.location.href = answer.app_link;
      }
      void watch(answer.session_id, deadline, mine);
    } catch (err) {
      setFailed(errorMessage(err)); setView({ phase: "idle" });
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    ticket.current++;
    forgetSession(window.sessionStorage);
    setView({ phase: "idle" });
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setCopied(false); }
  }

  const result = view.phase === "done" ? view.result : null;
  const report = result ? reportText({
    stage: result.stage, detail: result.detail, eidState: result.eidState, flow: mode?.flow,
    reg: mode?.reg_number, session, at: new Date().toISOString(),
  }) : "";

  return <section aria-labelledby="eid-sign-test-title" className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
    <div className="flex items-start gap-3">
      <Fingerprint aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
      <div className="min-w-0">
        <h2 id="eid-sign-test-title" className="font-semibold">{t("events.sign_test.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("events.sign_test.hint")}</p>
      </div>
    </div>

    {failed && <p role="alert" className="text-sm text-danger">{failed}</p>}

    {view.phase === "idle" && <button type="button" disabled={busy} onClick={() => void start()}
      className="min-h-11 rounded-md bg-accent px-5 font-medium text-on-accent disabled:opacity-50">{t("events.sign_test.start")}</button>}

    {view.phase === "waiting" && <div className="space-y-3 text-center" aria-live="polite">
      <p className="text-sm">{t(view.onPhone ? "events.sign_test.waiting_phone" : "events.sign_test.waiting")}</p>
      {view.code && <><p className="text-xs text-muted">{t("events.discussion.signing_code")}</p>
        <p className="text-4xl font-bold tracking-widest tabular-nums">{view.code}</p></>}
      <p className="text-xs text-muted tabular-nums">{t("events.discussion.signing_wait")} <span aria-hidden="true">{formatCountdown(view.deadline - now)}</span></p>
      <button type="button" onClick={stop} className="min-h-11 rounded-md border border-input px-4">{t("events.discussion.signing_stop")}</button>
    </div>}

    {result && <div className="space-y-3" aria-live="polite">
      {result.ok
        ? <p role="status" className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />{t("events.sign_test.success")}</p>
        : <>
          <p role="alert" className="flex items-start gap-2 font-semibold text-danger"><XCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />{t("events.sign_test.failed")}</p>
          <p className="text-sm">{t(stageKey(result.stage), { state: result.eidState || "—" })}</p>
        </>}
      <div className="space-y-2">
        <p className="text-xs text-muted">{t(result.ok ? "events.sign_test.details" : "events.sign_test.send_us")}</p>
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-mono text-xs">{report}</pre>
        <button type="button" onClick={() => void copy(report)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input px-4 text-sm">
          <Clipboard aria-hidden="true" className="h-4 w-4" />{t(copied ? "events.sign_test.copied" : "events.sign_test.copy")}</button>
      </div>
      <button type="button" disabled={busy} onClick={() => void start()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 font-medium text-on-accent disabled:opacity-50">
        <RotateCcw aria-hidden="true" className="h-4 w-4" />{t("events.sign_test.retry")}</button>
    </div>}

    {mode && <p className="text-xs text-muted">{t("events.sign_test.mode", {
      enabled: t(mode.signer_enabled ? "events.sign_test.mode_on" : "events.sign_test.mode_off"),
      flow: t(mode.flow === "device" ? "events.sign_test.flow_device" : "events.sign_test.flow_push"),
      reg: mode.reg_number || "—",
    })}</p>}
  </section>;
}
