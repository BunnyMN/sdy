"use client";

/**
 * Хэлэлцүүлэг: асуудал дэвшүүлэх → санал хураалт нээх → ирц нь батлагдсан
 * гишүүд eID-ээр зурж санал өгөх → хаах. Шийдвэр ба зурагдсан санал тухайн
 * арга хэмжээний түүх болж үлдэнэ.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Fingerprint, Gavel, MessageSquarePlus, Pencil, RotateCcw, Undo2, Vote, XCircle } from "lucide-react";

import { participationApi, type Motion, type MotionList, type SignedVote, type VoteChoice } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Chip, ErrorNote, Panel } from "@/components/module/kit";
import { LoadingBlock, Modal, fieldClass, useConfirm } from "@/components/ui";
import { memberDate } from "@/lib/memberFormat";
import { formatCountdown } from "@/lib/datetime";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { browserHint } from "@/components/EIDLogin";

function onPhone() { return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

/* On a phone the eID app is opened directly and returns to the callback page,
   which sends the member back here; the vote is then picked up below. */
function voteCallback(eventID: string) {
  const back = encodeURIComponent(`/module/events/${eventID}#discussion`);
  return `${window.location.origin}/auth/eid/callback?return=${back}${browserHint(navigator.userAgent).replace("?", "&")}`;
}

const choices: VoteChoice[] = ["yes", "no", "abstain"];
const POLL_EVERY = 2000;
const POLL_FOR = 3 * 60_000;

function statusKey(m: Motion) {
  return m.status === "decided" ? m.result : m.status;
}
const statusTone = { proposed: "slate", voting: "blue", approved: "emerald", rejected: "rose", withdrawn: "amber" } as const;

/**
 * Where a signature stands. "refused" is eID's answer (the member declined or
 * entered the wrong PIN); "timeout" is three minutes of no answer at all;
 * "error" is this page failing to ask. Each says something different to do.
 */
type Phase = "waiting" | "done" | "refused" | "timeout" | "error";
type Signing = { motion: Motion; choice: VoteChoice; code: string; phase: Phase; message?: string; onPhone?: boolean; deadline: number; hidden?: boolean };

export default function EventDiscussion({ eventID, onSummary }: {
  eventID: string;
  /** Told how many issues are open for this member's vote, for the page's banner. */
  onSummary?: (summary: { voting: number }) => void;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const [data, setData] = useState<MotionList | null>(null);
  const [loadFailed, setLoadFailed] = useState("");
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string } | null>(null);
  const [signing, setSigning] = useState<Signing | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [rolls, setRolls] = useState<Record<string, SignedVote[]>>({});
  const ticket = useRef(0);

  const load = useCallback(async () => {
    try { const r = await participationApi.motions(eventID); setData({ ...r, motions: r.motions ?? [] }); setLoadFailed(""); }
    catch (err) { setLoadFailed(errorMessage(err)); }
  }, [eventID, errorMessage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { ticket.current++; }, []);
  useEffect(() => {
    if (!data || !onSummary) return;
    onSummary({ voting: data.can_vote && data.signing_ready ? data.motions.filter(m => m.status === "voting" && m.my_vote?.status !== "signed").length : 0 });
  }, [data, onSummary]);
  // The countdown in the signing dialog.
  const waiting = signing?.phase === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true); setFailed("");
    try { await run(); await load(); }
    catch (err) { setFailed(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function submitDraft(e: React.FormEvent) {
    e.preventDefault(); if (!draft) return;
    const input = { title: draft.title.trim(), body: draft.body.trim() };
    await act(async () => {
      if (draft.id) await participationApi.editMotion(eventID, draft.id, input);
      else await participationApi.propose(eventID, input);
      setDraft(null);
    });
  }

  /* Start the signature, then ask the API about it every two seconds until
     eID answers or three minutes pass. One attempt at a time: a newer one
     takes the ticket and the older loop stops. */
  async function vote(motion: Motion, choice: VoteChoice) {
    setFailed(""); const mine = ++ticket.current;
    try {
      const phone = onPhone();
      const started = await participationApi.vote(eventID, motion.id, choice, phone ? voteCallback(eventID) : "");
      setNow(Date.now());
      setSigning({ motion, choice, code: started.verification_code, phase: "waiting", onPhone: phone && !!started.app_link, deadline: Date.now() + POLL_FOR });
      if (phone && started.app_link) window.location.href = started.app_link;
      await watchVote(motion, started.session_id, mine);
    } catch (err) {
      setSigning(null); setFailed(errorMessage(err));
    }
  }

  /* Stop waiting here. The eID request itself cannot be withdrawn from this
     side, so the list is read again: a signature given meanwhile still shows. */
  function stopWaiting() {
    ticket.current++;
    setSigning(null);
    void load();
  }

  /* Ask the API about the vote every two seconds until eID answers or three
     minutes pass. Without a session id it asks about the caller's own vote,
     which is how a page reopened after the eID app picks it up again. */
  async function watchVote(motion: Motion, sessionID: string, mine: number) {
    const deadline = Date.now() + POLL_FOR;
    while (ticket.current === mine && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_EVERY));
      if (ticket.current !== mine) return;
      try {
        const state = await participationApi.pollVote(eventID, motion.id, sessionID);
        // A dialog the member closed while waiting is shown again for the answer.
        if (state.state === "signed") { setSigning(s => s && { ...s, phase: "done", hidden: false }); await load(); return; }
        if (state.state === "failed") { setSigning(s => s && { ...s, phase: "refused", hidden: false }); await load(); return; }
      } catch (err) {
        setSigning(s => s && { ...s, phase: "error", message: errorMessage(err), hidden: false }); await load(); return;
      }
    }
    if (ticket.current === mine) { setSigning(s => s && { ...s, phase: "timeout", hidden: false }); await load(); }
  }

  // A vote left signing — the eID app was opened and the page came back —
  // is picked up once, without its session id.
  const resumed = useRef(false);
  useEffect(() => {
    if (!data || resumed.current) return;
    const pending = data.motions.find(m => m.status === "voting" && m.my_vote?.status === "signing");
    if (!pending?.my_vote) return;
    resumed.current = true;
    const mine = ++ticket.current;
    setSigning({ motion: pending, choice: pending.my_vote.choice, code: "", phase: "waiting", deadline: Date.now() + POLL_FOR });
    void watchVote(pending, "", mine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function showRoll(motion: Motion) {
    if (rolls[motion.id]) { setRolls(r => { const next = { ...r }; delete next[motion.id]; return next; }); return; }
    try { const { votes } = await participationApi.votes(eventID, motion.id); setRolls(r => ({ ...r, [motion.id]: votes })); }
    catch (err) { setFailed(errorMessage(err)); }
  }

  async function withdraw(motion: Motion) {
    if (!(await confirm({ title: t("events.discussion.withdraw_confirm", { title: motion.title }), confirmLabel: t("events.discussion.withdraw"), tone: "danger" }))) return;
    await act(() => participationApi.motionAction(eventID, motion.id, "withdraw", ""));
  }

  async function closeVote(motion: Motion) {
    if (!(await confirm({ title: t("events.discussion.close_vote"), body: t("events.discussion.close_confirm"), confirmLabel: t("events.discussion.close_vote") }))) return;
    await act(() => participationApi.motionAction(eventID, motion.id, "close"));
  }

  const btn = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground disabled:opacity-50";
  const open = data && data.event_status !== "cancelled";

  return (
    <Panel>
      <section id="discussion" aria-labelledby="discussion-title" className="scroll-mt-24">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id="discussion-title" className="flex items-center gap-2 text-sm font-semibold text-foreground"><Gavel className="h-4 w-4" />{t("events.discussion.title")}</h2>
            <p className="mt-1 text-xs text-muted">{t("events.discussion.hint")}</p>
          </div>
          {open && !draft && <button disabled={busy} onClick={() => setDraft({ title: "", body: "" })} className={btn}><MessageSquarePlus className="h-3.5 w-3.5" />{t("events.discussion.propose")}</button>}
        </header>

        <div className="space-y-3 p-4">
          {failed && <ErrorNote>{failed}</ErrorNote>}
          {loadFailed && <div className="flex flex-wrap items-center gap-2"><ErrorNote>{loadFailed}</ErrorNote>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-input px-4 text-sm">{t("membership.retry")}</button></div>}
          {!data && !loadFailed && <LoadingBlock rows={2} />}
          {signing?.hidden && signing.phase === "waiting" && <p role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-info-soft p-3 text-sm text-info">
            <Clock aria-hidden="true" className="h-4 w-4" />{t("events.discussion.signing_pending")}
            <button type="button" onClick={() => setSigning({ ...signing, hidden: false })} className="min-h-11 underline">{t("events.discussion.signing_show")}</button></p>}
          {data && <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>{t("events.discussion.eligible", { count: data.eligible })}</span>
            {!data.signing_ready && <span className="text-warning">{t("events.discussion.signing_off")}</span>}
            {data.signing_ready && !data.can_vote && <span>{t("events.discussion.not_eligible")}</span>}
          </p>}

          {draft && <form onSubmit={submitDraft} className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <label className="block space-y-1"><span className="text-xs font-semibold text-muted">{t("events.discussion.issue_title")}</span>
              <input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={`${fieldClass} w-full min-h-11`} /></label>
            <label className="block space-y-1"><span className="text-xs font-semibold text-muted">{t("events.discussion.issue_body")}</span>
              <textarea maxLength={4000} rows={3} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} className={`${fieldClass} w-full`} /></label>
            <div className="flex gap-2"><button disabled={busy || !draft.title.trim()} className="min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">{draft.id ? t("events.discussion.save") : t("events.discussion.submit")}</button>
              <button type="button" disabled={busy} onClick={() => setDraft(null)} className={btn}>{t("events.discussion.cancel")}</button></div>
          </form>}

          {data?.motions.length === 0 && !draft && <p className="py-4 text-center text-sm text-muted">{t("events.discussion.empty")}</p>}

          {data?.motions.map(m => {
            const key = statusKey(m);
            const counted = m.yes + m.no + m.abstain;
            const signedMine = m.my_vote?.status === "signed";
            const mayEdit = m.status === "proposed" && (data.can_manage || m.proposer_id === data.me);
            return <article key={m.id} className="space-y-3 rounded-lg border border-line p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{m.title}</h3>
                  <p className="text-xs text-muted">{t("events.discussion.by", { name: m.proposer_name || "—" })} · {memberDate(m.created_at)}</p>
                </div>
                <Chip tone={statusTone[key as keyof typeof statusTone] ?? "slate"}>{t(`events.discussion.status.${key}`)}</Chip>
              </div>
              {m.body && <p className="whitespace-pre-wrap text-sm">{m.body}</p>}

              {(m.status === "voting" || m.status === "decided") && <div className="space-y-1.5">
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <span className="bg-success" style={{ width: `${counted ? (m.yes / counted) * 100 : 0}%` }} />
                  <span className="bg-danger" style={{ width: `${counted ? (m.no / counted) * 100 : 0}%` }} />
                  <span className="bg-line-strong" style={{ width: `${counted ? (m.abstain / counted) * 100 : 0}%` }} />
                </div>
                <p className="text-xs tabular-nums text-muted">{t("events.discussion.result", { yes: m.yes, no: m.no, abstain: m.abstain })}</p>
              </div>}

              {m.my_vote && <p className={`flex items-center gap-1.5 text-xs ${m.my_vote.status === "failed" ? "text-danger" : ""}`}>
                {signedMine ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-success" /> : m.my_vote.status === "signing" ? <Clock aria-hidden="true" className="h-3.5 w-3.5 text-muted" /> : <XCircle aria-hidden="true" className="h-3.5 w-3.5" />}
                {signedMine ? <>{t("events.discussion.my_vote", { choice: t(`events.discussion.chose.${m.my_vote.choice}`) })} <span className="text-muted">· {t("events.discussion.signed")}</span></>
                  : m.my_vote.status === "signing" ? t("events.discussion.my_vote_signing", { choice: t(`events.discussion.chose.${m.my_vote.choice}`) })
                  : t("events.discussion.my_vote_failed")}
              </p>}

              <div className="flex flex-wrap gap-2">
                {m.status === "voting" && data.can_vote && data.signing_ready && !signedMine && choices.map(choice =>
                  <button key={choice} disabled={busy || !!signing} onClick={() => void vote(m, choice)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${choice === "yes" ? "bg-accent text-on-accent" : "border border-input"}`}>
                    <Vote className="h-4 w-4" />{t(`events.discussion.choice.${choice}`)}
                  </button>)}
                {data.can_manage && m.status === "proposed" && <button disabled={busy} onClick={() => void act(() => participationApi.motionAction(eventID, m.id, "open"))} className={btn}><Vote className="h-3.5 w-3.5" />{t("events.discussion.open_vote")}</button>}
                {data.can_manage && m.status === "voting" && <button disabled={busy} onClick={() => void closeVote(m)} className={btn}><Gavel className="h-3.5 w-3.5" />{t("events.discussion.close_vote")}</button>}
                {mayEdit && <button disabled={busy} onClick={() => setDraft({ id: m.id, title: m.title, body: m.body })} className={btn}><Pencil className="h-3.5 w-3.5" />{t("events.discussion.edit")}</button>}
                {mayEdit && <button disabled={busy} onClick={() => void withdraw(m)} className={btn}><Undo2 className="h-3.5 w-3.5" />{t("events.discussion.withdraw")}</button>}
                {(m.status === "decided" || (m.status === "voting" && data.can_manage)) && counted > 0 &&
                  <button onClick={() => void showRoll(m)} aria-expanded={!!rolls[m.id]} className={btn}><Fingerprint className="h-3.5 w-3.5" />{t("events.discussion.roll")}</button>}
              </div>

              {rolls[m.id] && <div className="space-y-2 rounded-md bg-surface-2 p-3 text-xs">
                {m.content_hash && <p className="break-all text-muted">{t("events.discussion.text_hash")}: <code>{m.content_hash}</code></p>}
                <ul className="divide-y divide-line">
                  {rolls[m.id].map(v => <li key={v.user_id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="font-medium text-foreground">{v.name || "—"}</span>
                    <span>{t(`events.discussion.chose.${v.choice}`)}</span>
                    <span className="text-muted">{memberDate(v.signed_at)}</span>
                    <code className="w-full truncate text-muted" title={v.digest}>{v.digest}</code>
                  </li>)}
                </ul>
              </div>}
            </article>;
          })}
        </div>
      </section>

      {signing && !signing.hidden && <Modal label={t("events.discussion.signing_title")} onClose={() => signing.phase === "waiting" ? setSigning({ ...signing, hidden: true }) : setSigning(null)}>
        <div className="space-y-4 text-center">
          <Fingerprint aria-hidden="true" className="mx-auto h-10 w-10 text-accent" />
          <h2 className="text-lg font-semibold">{t("events.discussion.signing_title")}</h2>
          <p className="text-sm text-muted">{signing.motion.title} · <strong className="text-foreground">{t(`events.discussion.chose.${signing.choice}`)}</strong></p>
          {signing.phase === "waiting" && <>
            <p className="text-sm">{t(signing.onPhone ? "events.discussion.signing_body_phone" : "events.discussion.signing_body")}</p>
            {signing.code && <><p className="text-xs text-muted">{t("events.discussion.signing_code")}</p>
            <p className="text-4xl font-bold tracking-widest tabular-nums">{signing.code}</p></>}
            <p className="text-xs text-muted tabular-nums">{t("events.discussion.signing_wait")} <span aria-hidden="true">{formatCountdown(signing.deadline - now)}</span></p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setSigning({ ...signing, hidden: true })} className="min-h-11 rounded-lg border border-input px-4">{t("events.discussion.signing_hide")}</button>
              <button type="button" onClick={stopWaiting} className="min-h-11 rounded-lg border border-input px-4">{t("events.discussion.signing_stop")}</button>
            </div>
          </>}
          <div aria-live="polite">
            {signing.phase === "done" && <p className="flex items-center justify-center gap-2 font-semibold text-success"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />{t("events.discussion.signing_done")}</p>}
            {signing.phase === "refused" && <p role="alert" className="text-danger">{t("events.discussion.signing_failed")}</p>}
            {signing.phase === "timeout" && <p role="alert" className="text-danger">{t("events.discussion.signing_timeout")}</p>}
            {signing.phase === "error" && <p role="alert" className="text-danger">{signing.message || t("events.discussion.signing_failed")}</p>}
          </div>
          {signing.phase !== "waiting" && <div className="flex flex-wrap justify-center gap-2">
            {signing.phase !== "done" && <button type="button" onClick={() => { const { motion, choice } = signing; setSigning(null); void vote(motion, choice); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 font-semibold text-on-accent"><RotateCcw aria-hidden="true" className="h-4 w-4" />{t("membership.retry")}</button>}
            <button type="button" onClick={() => setSigning(null)} className="min-h-11 rounded-lg border border-input px-4">{t("base.action.close")}</button>
          </div>}
        </div>
      </Modal>}
    </Panel>
  );
}
