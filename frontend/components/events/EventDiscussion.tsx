"use client";

/**
 * Хэлэлцүүлэг: асуудал дэвшүүлэх → санал хураалт нээх → ирц нь батлагдсан
 * гишүүд eID-ээр зурж санал өгөх → хаах. Шийдвэр ба зурагдсан санал тухайн
 * арга хэмжээний түүх болж үлдэнэ.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Fingerprint, Gavel, MessageSquarePlus, Pencil, Undo2, Vote, XCircle } from "lucide-react";

import { participationApi, type Motion, type MotionList, type SignedVote, type VoteChoice } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Chip, ConfirmDialog, ErrorNote, Panel } from "@/components/module/kit";
import { Modal, fieldClass } from "@/components/ui";
import { memberDate } from "@/lib/memberFormat";

const choices: VoteChoice[] = ["yes", "no", "abstain"];
const POLL_EVERY = 2000;
const POLL_FOR = 3 * 60_000;

function statusKey(m: Motion) {
  return m.status === "decided" ? m.result : m.status;
}
const statusTone = { proposed: "slate", voting: "blue", approved: "emerald", rejected: "rose", withdrawn: "amber" } as const;

type Signing = { motion: Motion; choice: VoteChoice; code: string; phase: "waiting" | "done" | "failed"; message?: string };

export default function EventDiscussion({ eventID }: { eventID: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<MotionList | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string } | null>(null);
  const [closing, setClosing] = useState<Motion | null>(null);
  const [signing, setSigning] = useState<Signing | null>(null);
  const [rolls, setRolls] = useState<Record<string, SignedVote[]>>({});
  const ticket = useRef(0);

  const load = useCallback(async () => {
    try { setData(await participationApi.motions(eventID)); }
    catch (err) { setFailed(err instanceof Error ? err.message : "—"); }
  }, [eventID]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { ticket.current++; }, []);

  async function act(run: () => Promise<unknown>) {
    setBusy(true); setFailed("");
    try { await run(); await load(); }
    catch (err) { setFailed(err instanceof Error ? err.message : "—"); }
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
      const started = await participationApi.vote(eventID, motion.id, choice);
      setSigning({ motion, choice, code: started.verification_code, phase: "waiting" });
      const deadline = Date.now() + POLL_FOR;
      while (ticket.current === mine && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, POLL_EVERY));
        if (ticket.current !== mine) return;
        try {
          const state = await participationApi.pollVote(eventID, motion.id, started.session_id);
          if (state.state === "signed") { setSigning(s => s && { ...s, phase: "done" }); await load(); return; }
          if (state.state === "failed") { setSigning(s => s && { ...s, phase: "failed" }); await load(); return; }
        } catch (err) {
          setSigning(s => s && { ...s, phase: "failed", message: err instanceof Error ? err.message : "" }); await load(); return;
        }
      }
      if (ticket.current === mine) setSigning(s => s && { ...s, phase: "failed" });
    } catch (err) {
      setSigning(null); setFailed(err instanceof Error ? err.message : "—");
    }
  }

  async function showRoll(motion: Motion) {
    if (rolls[motion.id]) { setRolls(r => { const next = { ...r }; delete next[motion.id]; return next; }); return; }
    try { const { votes } = await participationApi.votes(eventID, motion.id); setRolls(r => ({ ...r, [motion.id]: votes })); }
    catch (err) { setFailed(err instanceof Error ? err.message : "—"); }
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

              {m.my_vote && <p className="flex items-center gap-1.5 text-xs">
                {signedMine ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-muted" />}
                {t("events.discussion.my_vote", { choice: t(`events.discussion.chose.${m.my_vote.choice}`) })}
                {signedMine && <span className="text-muted">· {t("events.discussion.signed")}</span>}
              </p>}

              <div className="flex flex-wrap gap-2">
                {m.status === "voting" && data.can_vote && data.signing_ready && !signedMine && choices.map(choice =>
                  <button key={choice} disabled={busy || !!signing} onClick={() => void vote(m, choice)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${choice === "yes" ? "bg-accent text-on-accent" : "border border-input"}`}>
                    <Vote className="h-4 w-4" />{t(`events.discussion.choice.${choice}`)}
                  </button>)}
                {data.can_manage && m.status === "proposed" && <button disabled={busy} onClick={() => void act(() => participationApi.motionAction(eventID, m.id, "open"))} className={btn}><Vote className="h-3.5 w-3.5" />{t("events.discussion.open_vote")}</button>}
                {data.can_manage && m.status === "voting" && <button disabled={busy} onClick={() => setClosing(m)} className={btn}><Gavel className="h-3.5 w-3.5" />{t("events.discussion.close_vote")}</button>}
                {mayEdit && <button disabled={busy} onClick={() => setDraft({ id: m.id, title: m.title, body: m.body })} className={btn}><Pencil className="h-3.5 w-3.5" />{t("events.discussion.edit")}</button>}
                {mayEdit && <button disabled={busy} onClick={() => void act(() => participationApi.motionAction(eventID, m.id, "withdraw", ""))} className={btn}><Undo2 className="h-3.5 w-3.5" />{t("events.discussion.withdraw")}</button>}
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

      {closing && <ConfirmDialog title={t("events.discussion.close_vote")} body={t("events.discussion.close_confirm")} confirmLabel={t("events.discussion.close_vote")}
        onCancel={() => setClosing(null)} onConfirm={() => { const m = closing; setClosing(null); void act(() => participationApi.motionAction(eventID, m.id, "close")); }} />}

      {signing && <Modal label={t("events.discussion.signing_title")} onClose={() => { ticket.current++; setSigning(null); }}>
        <div className="space-y-4 text-center" aria-live="polite">
          <Fingerprint className="mx-auto h-10 w-10 text-accent" />
          <h2 className="text-lg font-semibold">{t("events.discussion.signing_title")}</h2>
          <p className="text-sm text-muted">{signing.motion.title} · <strong className="text-foreground">{t(`events.discussion.chose.${signing.choice}`)}</strong></p>
          {signing.phase === "waiting" && <>
            <p className="text-sm">{t("events.discussion.signing_body")}</p>
            <p className="text-xs text-muted">{t("events.discussion.signing_code")}</p>
            <p className="text-4xl font-bold tracking-widest tabular-nums">{signing.code}</p>
            <p className="text-xs text-muted">{t("events.discussion.signing_wait")}</p>
          </>}
          {signing.phase === "done" && <p className="flex items-center justify-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" />{t("events.discussion.signing_done")}</p>}
          {signing.phase === "failed" && <p className="text-danger">{signing.message || t("events.discussion.signing_failed")}</p>}
          {signing.phase !== "waiting" && <button onClick={() => setSigning(null)} className="min-h-11 rounded-lg border border-input px-4">{t("events.discussion.cancel")}</button>}
        </div>
      </Modal>}
    </Panel>
  );
}
