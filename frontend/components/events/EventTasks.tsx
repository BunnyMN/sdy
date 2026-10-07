"use client";

/**
 * Ажил үүрэг: менежер ажил нэмж, гишүүнд санал болгоно; гишүүн хүлээн авах,
 * татгалзах эсвэл сул байрт өөрөө орно; гүйцэтгэл батлагдахад оноо орно.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardList, HandHelping, Plus, Trash2, Undo2, UserPlus, X } from "lucide-react";

import { eventsApi, participationApi, type AssignmentStatus, type Task, type TaskInput } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Chip, ErrorNote, Panel } from "@/components/module/kit";
import { fieldClass, selectClass } from "@/components/ui";

const tone: Record<AssignmentStatus, "slate" | "emerald" | "amber" | "rose" | "blue"> = {
  offered: "amber", accepted: "blue", declined: "slate", done: "emerald",
};
const blank: TaskInput = { title: "", description: "", points: 0, slots: 1 };

export default function EventTasks({ eventID, closed }: { eventID: string; closed: boolean }) {
  const { t } = useI18n();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [manager, setManager] = useState(false);
  const [me, setMe] = useState("");
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TaskInput | null>(null);
  const [members, setMembers] = useState<{ user_id: string; name: string; email: string }[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { const r = await participationApi.tasks(eventID); setTasks(r.tasks); setManager(r.can_manage); setMe(r.me); }
    catch (err) { setFailed(err instanceof Error ? err.message : "—"); }
  }, [eventID]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!manager || members.length) return;
    eventsApi.members().then(r => setMembers(r.members)).catch(() => {});
  }, [manager, members.length]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true); setFailed("");
    try { await run(); await load(); }
    catch (err) { setFailed(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }

  const btn = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground disabled:opacity-50";
  const primary = "inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50";

  return (
    <Panel>
      <section id="tasks" aria-labelledby="tasks-title" className="scroll-mt-24">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id="tasks-title" className="flex items-center gap-2 text-sm font-semibold text-foreground"><ClipboardList className="h-4 w-4" />{t("events.tasks.title")}</h2>
            <p className="mt-1 text-xs text-muted">{t("events.tasks.hint")}</p>
          </div>
          {manager && !closed && !draft && <button disabled={busy} onClick={() => setDraft(blank)} className={btn}><Plus className="h-3.5 w-3.5" />{t("events.tasks.new")}</button>}
        </header>

        <div className="space-y-3 p-4">
          {failed && <ErrorNote>{failed}</ErrorNote>}

          {draft && <form onSubmit={e => { e.preventDefault(); void act(async () => { await participationApi.createTask(eventID, { ...draft, title: draft.title.trim(), description: draft.description.trim() }); setDraft(null); }); }}
            className="grid gap-3 rounded-lg border border-line bg-surface-2 p-3 sm:grid-cols-4">
            <label className="space-y-1 sm:col-span-2"><span className="text-xs font-semibold text-muted">{t("events.tasks.name")}</span>
              <input required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={`${fieldClass} w-full min-h-11`} /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-muted">{t("events.tasks.points")}</span>
              <input type="number" min={0} max={100000} value={draft.points} onChange={e => setDraft({ ...draft, points: Number(e.target.value) })} className={`${fieldClass} w-full min-h-11 tabular-nums`} /></label>
            <label className="space-y-1"><span className="text-xs font-semibold text-muted">{t("events.tasks.slots")}</span>
              <input type="number" min={1} max={500} value={draft.slots} onChange={e => setDraft({ ...draft, slots: Number(e.target.value) })} className={`${fieldClass} w-full min-h-11 tabular-nums`} /></label>
            <label className="space-y-1 sm:col-span-4"><span className="text-xs font-semibold text-muted">{t("events.tasks.description")}</span>
              <textarea maxLength={2000} rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} className={`${fieldClass} w-full`} /></label>
            <div className="flex gap-2 sm:col-span-4"><button disabled={busy || !draft.title.trim()} className={primary}>{t("events.tasks.new")}</button>
              <button type="button" onClick={() => setDraft(null)} className={btn}>{t("events.discussion.cancel")}</button></div>
          </form>}

          {tasks?.length === 0 && !draft && <p className="py-4 text-center text-sm text-muted">{t("events.tasks.empty")}</p>}

          {tasks?.map(task => {
            const mine = task.assignments.find(a => a.user_id === me);
            const free = task.taken < task.slots;
            const assigned = new Set(task.assignments.map(a => a.user_id));
            return <article key={task.id} className="space-y-3 rounded-lg border border-line p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground">{task.title}</h3>
                  {task.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{task.description}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="emerald">+{task.points} {t("events.tasks.points").toLowerCase()}</Chip>
                  <Chip tone={free ? "blue" : "slate"}>{t("events.tasks.taken", { taken: task.taken, slots: task.slots })}</Chip>
                </div>
              </div>

              {mine?.status === "offered" && <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-3 text-sm">
                <span className="flex-1">{t("events.tasks.offer_for_you")}</span>
                <button disabled={busy || !free} onClick={() => void act(() => participationApi.respond(eventID, task.id, true))} className={primary}><Check className="h-3.5 w-3.5" />{t("events.tasks.accept")}</button>
                <button disabled={busy} onClick={() => void act(() => participationApi.respond(eventID, task.id, false))} className={btn}><X className="h-3.5 w-3.5" />{t("events.tasks.decline")}</button>
              </div>}

              {task.assignments.length > 0 && <ul className="divide-y divide-line rounded-md border border-line">
                {task.assignments.map(a => <li key={a.user_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{a.name || "—"}{a.user_id === me ? ` ${t("events.tasks.you")}` : ""}</span>
                  <Chip tone={tone[a.status]}>{t(`events.tasks.status.${a.status}`)}{a.status === "done" && a.points_awarded > 0 ? ` +${a.points_awarded}` : ""}</Chip>
                  {manager && a.status === "accepted" && <button disabled={busy} onClick={() => void act(() => participationApi.assignment(eventID, task.id, a.user_id, "done"))} className={primary}><Check className="h-3.5 w-3.5" />{t("events.tasks.complete")}</button>}
                  {manager && a.status === "done" && <button disabled={busy} onClick={() => void act(() => participationApi.assignment(eventID, task.id, a.user_id, "undo"))} className={btn}><Undo2 className="h-3.5 w-3.5" />{t("events.tasks.undo")}</button>}
                  {manager && a.status !== "done" && <button disabled={busy} onClick={() => void act(() => participationApi.unassign(eventID, task.id, a.user_id))} className={btn}><X className="h-3.5 w-3.5" />{t("events.tasks.remove")}</button>}
                  {!manager && a.user_id === me && a.status === "accepted" && <button disabled={busy} onClick={() => void act(() => participationApi.respond(eventID, task.id, false))} className={btn}>{t("events.tasks.step_back")}</button>}
                </li>)}
              </ul>}

              <div className="flex flex-wrap items-center gap-2">
                {!closed && free && (!mine || mine.status === "declined") && <button disabled={busy} onClick={() => void act(() => participationApi.volunteer(eventID, task.id))} className={btn}><HandHelping className="h-3.5 w-3.5" />{t("events.tasks.volunteer")}</button>}
                {manager && !closed && <>
                  <select aria-label={t("events.tasks.assign")} value={picks[task.id] ?? ""} onChange={e => setPicks({ ...picks, [task.id]: e.target.value })} className={`${selectClass} max-w-56`}>
                    <option value="">{t("events.tasks.assign")}…</option>
                    {members.filter(p => !assigned.has(p.user_id) || task.assignments.find(a => a.user_id === p.user_id)?.status === "declined")
                      .map(p => <option key={p.user_id} value={p.user_id}>{p.name || p.email}</option>)}
                  </select>
                  <button disabled={busy || !picks[task.id]} onClick={() => void act(async () => { await participationApi.assign(eventID, task.id, picks[task.id]); setPicks({ ...picks, [task.id]: "" }); })} className={btn}><UserPlus className="h-3.5 w-3.5" />{t("events.tasks.assign")}</button>
                </>}
                {manager && !task.assignments.some(a => a.status === "done") && <button disabled={busy} onClick={() => void act(() => participationApi.deleteTask(eventID, task.id))} className={`${btn} ml-auto`}><Trash2 className="h-3.5 w-3.5" />{t("events.tasks.delete")}</button>}
              </div>
            </article>;
          })}
        </div>
      </section>
    </Panel>
  );
}
