"use client";

/**
 * Нэг арга хэмжээ: мэдээлэл, өөрийн бүртгэл, оролцогчдын жагсаалт ба ирц.
 *
 * Гишүүн бүртгүүлж, цуцалж чадна (events.read). Менежер (events.manage)
 * арга хэмжээг засаж, оролцогч нэмж, хэн ирснийг тэмдэглэнэ — мөр бүр дээр
 * гурван товч: ирсэн, ирээгүй, буцаах.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarDays, Check, MapPin, Pencil, Plus, Undo2, UserPlus, Users, Vote, X } from "lucide-react";

import { eventsApi, type AttendanceStatus, type EventInput, type EventRecord, type Participant } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Screen, Panel, ErrorNote, Chip, useAccess } from "@/components/module/kit";
import { Banner, LoadingBlock, Modal, selectClass, fieldClass, useConfirm } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { EventForm, eventCounts, eventStatusTone, formatWhen } from "../shared";
import CheckinCode from "@/components/membership/CheckinCode";
import EventDiscussion from "@/components/events/EventDiscussion";
import EventTasks from "@/components/events/EventTasks";

const attendanceTone: Record<AttendanceStatus, "slate" | "emerald" | "amber" | "rose" | "blue"> = {
  registered: "blue",
  attended: "emerald",
  absent: "amber",
};

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const { allowed: canManage } = useAccess("events.manage");
  const [voting, setVoting] = useState(0);
  const onSummary = useCallback(({ voting }: { voting: number }) => setVoting(voting), []);
  const [event, setEvent] = useState<EventRecord | null | undefined>(undefined);
  const [people, setPeople] = useState<Participant[]>([]);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; name: string; email: string }[]>([]);
  const [pick, setPick] = useState("");
  const [correction, setCorrection] = useState<{ person: Participant; status: AttendanceStatus } | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  const load = useCallback(async () => {
    setFailed("");
    // The participant list is secondary: if only it fails, the event still shows.
    const [one, list] = await Promise.allSettled([eventsApi.get(id), eventsApi.participants(id)]);
    if (one.status === "rejected") {
      setFailed(errorMessage(one.reason));
      setEvent(null);
      return;
    }
    setEvent(one.value);
    if (list.status === "fulfilled") setPeople(list.value.participants);
    else setFailed(errorMessage(list.reason));
  }, [id, errorMessage]);

  useEffect(() => { void load(); }, [load]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setFailed("");
    try {
      await run();
      await load();
    } catch (err: unknown) {
      setFailed(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openAdd() {
    setAdding(true);
    if (members.length === 0) {
      try {
        const listed = (await eventsApi.members()).members;
        const already = new Set(people.map((p) => p.user_id));
        setMembers(listed.filter((m) => !already.has(m.user_id)));
      } catch (err: unknown) {
        setFailed(errorMessage(err));
      }
    }
  }

  function mark(person: Participant, status: AttendanceStatus) {
    if (person.status === "registered") {
      void act(() => eventsApi.mark(id, person.user_id, status, person.note));
    } else {
      setCorrection({ person, status }); setCorrectionReason(""); setFailed("");
    }
  }

  async function saveCorrection(e: React.FormEvent) {
    e.preventDefault(); if (!correction) return;
    setBusy(true); setFailed("");
    try {
      await eventsApi.mark(id, correction.person.user_id, correction.status, correctionReason.trim());
      setCorrection(null); await load();
    } catch (err) { setFailed(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function save(input: EventInput) {
    setBusy(true);
    try {
      await eventsApi.update(id, input);
      setEditing(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!(await confirm({ title: t("events.action.withdraw_confirm"), confirmLabel: t("events.action.withdraw"), tone: "danger" }))) return;
    await act(() => eventsApi.withdraw(id));
  }

  // The member shell above this page already carries the way back to the list.
  if (event === undefined) return <LoadingBlock label={t("events.message.loading")} />;
  if (event === null) {
    return (
      <Screen icon={<CalendarDays className="w-5 h-5" />} title={t("events.view.title")} subtitle="">
        <ErrorNote>{failed || t("events.message.not_found")}</ErrorNote>
        <button type="button" onClick={() => { setEvent(undefined); void load(); }} className="min-h-11 rounded-lg border border-input px-4 text-sm">{t("membership.retry")}</button>
      </Screen>
    );
  }

  const full = event.capacity !== null && event.registered >= event.capacity;
  const open = event.status === "planned";
  const btn = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-line text-muted hover:text-foreground disabled:opacity-50";

  const participantList = people.length === 0 ? (
      <p className="p-8 text-center text-sm text-muted">{t("events.message.no_participants")}</p>
    ) : (
      <ul className="divide-y divide-line">
        {people.map((p) => (
          <li key={p.user_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-foreground truncate">{p.name || p.email}</strong>
              <span className="text-xs text-muted">{p.email}{p.note ? ` · ${p.note}` : ""}</span>
            </span>
            <Chip tone={attendanceTone[p.status]}>{t(`events.attendance.${p.status}`)}</Chip>
            {canManage && (
              <span className="flex gap-1">
                {p.status !== "attended" && (
                  <button disabled={busy} title={t("events.action.mark_attended")}
                    onClick={() => mark(p, "attended")}
                    className={`${btn} text-success`}><Check className="w-3.5 h-3.5" /> {t("events.action.mark_attended")}</button>
                )}
                {p.status !== "absent" && (
                  <button disabled={busy} title={t("events.action.mark_absent")}
                    onClick={() => mark(p, "absent")}
                    className={btn}><X className="w-3.5 h-3.5" /> {t("events.action.mark_absent")}</button>
                )}
                {p.status !== "registered" && (
                  <button disabled={busy} title={t("events.action.mark_registered")}
                    onClick={() => mark(p, "registered")}
                    className={btn}><Undo2 className="w-3.5 h-3.5" /> {t("events.action.mark_registered")}</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
  );

  return (
    <Screen
      icon={<CalendarDays className="w-5 h-5" />}
      title={event.title}
      subtitle={event.description}
      action={canManage ? (
        <button onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted">
          <Pencil className="w-4 h-4" /> {t("events.action.edit")}
        </button>
      ) : undefined}
    >
      {voting > 0 && <Banner tone="info">
        <a href="#discussion" className="inline-flex min-h-11 items-center gap-2 font-semibold underline"><Vote aria-hidden="true" className="h-4 w-4" />{t("events.discussion.open_banner", { count: voting })}</a>
      </Banner>}

      <Panel className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Chip tone={eventStatusTone[event.status]}>{t(`events.status.${event.status}`)}</Chip>
        <span className="inline-flex items-center gap-1.5 text-muted tabular-nums"><CalendarDays aria-hidden="true" className="w-4 h-4" />
          {formatWhen(event.starts_at)}{event.ends_at ? ` — ${formatWhen(event.ends_at)}` : ""}
        </span>
        {event.location && <span className="inline-flex items-center gap-1.5 text-muted"><MapPin className="w-4 h-4" />{event.location}</span>}
        <span className="inline-flex items-center gap-1.5 text-muted tabular-nums"><Users aria-hidden="true" className="w-4 h-4" />
          {eventCounts(t, event)}
          {full && <Chip tone="rose">{t("events.message.full")}</Chip>}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {event.my_status ? (
            <>
              <span className="text-xs text-muted">{t("events.message.my_status")}:</span>
              <Chip tone={attendanceTone[event.my_status]}>{t(`events.attendance.${event.my_status}`)}</Chip>
              {event.my_status === "registered" && open && (
                <button disabled={busy} onClick={() => void withdraw()} className={btn}>
                  <X className="w-3.5 h-3.5" /> {t("events.action.withdraw")}
                </button>
              )}
            </>
          ) : open && !full ? (
            <button disabled={busy} onClick={() => act(() => eventsApi.register(id))}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">
              <Plus className="w-4 h-4" /> {t("events.action.register")}
            </button>
          ) : null}
        </span>
      </Panel>

      {failed && <ErrorNote>{failed}</ErrorNote>}

      {canManage && open && <CheckinCode eventID={id} />}

      {canManage ? <>
        <Panel>
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-foreground">{t("events.view.participants")} ({people.length})</h2>
          {canManage && (
            <button onClick={() => void openAdd()} className={btn}><UserPlus className="w-3.5 h-3.5" /> {t("events.view.add_participant")}</button>
          )}
        </header>
        {participantList}
        </Panel>
        <EventDiscussion eventID={id} onSummary={onSummary} />
        <EventTasks eventID={id} closed={event.status !== "planned"} />
      </> : <>
        <EventDiscussion eventID={id} onSummary={onSummary} />
        <EventTasks eventID={id} closed={event.status !== "planned"} />
        {/* For a member the list of who else is coming is the least of it, so it is folded away below what asks something of them. */}
        <Panel>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-sm font-semibold text-foreground">{t("events.view.participants")} ({people.length})</summary>
            {participantList}
          </details>
        </Panel>
      </>}

      {correction && <Modal label={t("membership.record.correction")} onClose={() => { if (!busy) setCorrection(null); }}>
        <form onSubmit={saveCorrection} className="space-y-4">
          <h2 className="text-lg font-semibold">{t("membership.record.correction")}</h2>
          <p>{correction.person.name} · {t(`events.attendance.${correction.status}`)}</p>
          <label className="block space-y-2"><span>{t("membership.record.reason")}</span><textarea required maxLength={500} rows={3} value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} className={`${fieldClass} w-full`} /></label>
          {failed && <ErrorNote>{failed}</ErrorNote>}
          <div className="flex gap-3"><button disabled={busy || !correctionReason.trim()} className="min-h-11 rounded-md bg-accent px-4 text-on-accent disabled:opacity-50">{t("dues.save")}</button><button type="button" disabled={busy} onClick={() => setCorrection(null)} className="min-h-11 rounded-md border border-input px-4">{t("membership.back")}</button></div>
        </form>
      </Modal>}
      {editing && (
        <Modal onClose={() => setEditing(false)} size="lg">
          <EventForm initial={event} onSave={save} onCancel={() => setEditing(false)} busy={busy} />
        </Modal>
      )}

      {adding && (
        <Modal onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("events.view.add_participant")}</h2>
            <label htmlFor="event-participant" className="block text-xs font-semibold text-muted">{t("events.field.member")}</label>
            <select id="event-participant" value={pick} onChange={(e) => setPick(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email} · {m.email}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className={btn}>{t("events.action.cancel")}</button>
              <button disabled={busy || !pick}
                onClick={() => act(async () => { await eventsApi.addParticipant(id, pick); setAdding(false); setPick(""); setMembers([]); })}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">
                {t("events.action.add")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Screen>
  );
}
