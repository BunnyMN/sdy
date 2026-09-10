"use client";

/**
 * Нэг арга хэмжээ: мэдээлэл, өөрийн бүртгэл, оролцогчдын жагсаалт ба ирц.
 *
 * Гишүүн бүртгүүлж, цуцалж чадна (events.read). Менежер (events.manage)
 * арга хэмжээг засаж, оролцогч нэмж, хэн ирснийг тэмдэглэнэ — мөр бүр дээр
 * гурван товч: ирсэн, ирээгүй, буцаах.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, MapPin, Pencil, Plus, Undo2, UserPlus, Users, X } from "lucide-react";

import { eventsApi, type AttendanceStatus, type EventInput, type EventRecord, type Participant } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Screen, Panel, Loading, ErrorNote, Chip, useAccess } from "@/components/module/kit";
import { Modal, selectClass } from "@/components/ui";
import { EventForm, eventStatusTone, formatWhen } from "../shared";

const attendanceTone: Record<AttendanceStatus, "slate" | "emerald" | "amber" | "rose" | "blue"> = {
  registered: "blue",
  attended: "emerald",
  absent: "amber",
};

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { allowed: canManage } = useAccess("events.manage");
  const [event, setEvent] = useState<EventRecord | null | undefined>(undefined);
  const [people, setPeople] = useState<Participant[]>([]);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; name: string; email: string }[]>([]);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    setFailed("");
    try {
      const [one, list] = await Promise.all([eventsApi.get(id), eventsApi.participants(id)]);
      setEvent(one);
      setPeople(list.participants);
    } catch (err: unknown) {
      setFailed(err instanceof Error ? err.message : "—");
      setEvent(null);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setFailed("");
    try {
      await run();
      await load();
    } catch (err: unknown) {
      setFailed(err instanceof Error ? err.message : "—");
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
        setFailed(err instanceof Error ? err.message : "—");
      }
    }
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

  if (event === undefined) return <Loading label={t("events.message.loading")} />;
  if (event === null) {
    return (
      <Screen icon={<CalendarDays className="w-5 h-5" />} title={t("events.view.title")} subtitle="">
        <ErrorNote>{failed || t("events.message.not_found")}</ErrorNote>
        <Link href="/module/events" className="text-sm text-accent inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" />{t("events.action.back")}</Link>
      </Screen>
    );
  }

  const full = event.capacity !== null && event.registered >= event.capacity;
  const open = event.status === "planned";
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-line text-muted hover:text-foreground disabled:opacity-50";

  return (
    <Screen
      icon={<CalendarDays className="w-5 h-5" />}
      title={event.title}
      subtitle={event.description}
      action={canManage ? (
        <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted">
          <Pencil className="w-4 h-4" /> {t("events.action.edit")}
        </button>
      ) : undefined}
    >
      <Link href="/module/events" className="text-sm text-accent inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" />{t("events.action.back")}</Link>

      <Panel className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <Chip tone={eventStatusTone[event.status]}>{t(`events.status.${event.status}`)}</Chip>
        <span className="inline-flex items-center gap-1.5 text-muted"><CalendarDays className="w-4 h-4" />
          {formatWhen(event.starts_at, locale)}{event.ends_at ? ` — ${formatWhen(event.ends_at, locale)}` : ""}
        </span>
        {event.location && <span className="inline-flex items-center gap-1.5 text-muted"><MapPin className="w-4 h-4" />{event.location}</span>}
        <span className="inline-flex items-center gap-1.5 text-muted"><Users className="w-4 h-4" />
          {t("events.message.counts", { registered: event.registered, attended: event.attended })}
          {event.capacity ? ` / ${event.capacity}` : ""}
          {full && <Chip tone="rose">{t("events.message.full")}</Chip>}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {event.my_status ? (
            <>
              <span className="text-xs text-muted">{t("events.message.my_status")}:</span>
              <Chip tone={attendanceTone[event.my_status]}>{t(`events.attendance.${event.my_status}`)}</Chip>
              {event.my_status === "registered" && open && (
                <button disabled={busy} onClick={() => act(() => eventsApi.withdraw(id))} className={btn}>
                  <X className="w-3.5 h-3.5" /> {t("events.action.withdraw")}
                </button>
              )}
            </>
          ) : open && !full ? (
            <button disabled={busy} onClick={() => act(() => eventsApi.register(id))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">
              <Plus className="w-4 h-4" /> {t("events.action.register")}
            </button>
          ) : null}
        </span>
      </Panel>

      {failed && <ErrorNote>{failed}</ErrorNote>}

      <Panel>
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-foreground">{t("events.view.participants")} ({people.length})</h2>
          {canManage && (
            <button onClick={() => void openAdd()} className={btn}><UserPlus className="w-3.5 h-3.5" /> {t("events.view.add_participant")}</button>
          )}
        </header>
        {people.length === 0 ? (
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
                        onClick={() => act(() => eventsApi.mark(id, p.user_id, "attended", p.note))}
                        className={`${btn} text-green-700`}><Check className="w-3.5 h-3.5" /> {t("events.action.mark_attended")}</button>
                    )}
                    {p.status !== "absent" && (
                      <button disabled={busy} title={t("events.action.mark_absent")}
                        onClick={() => act(() => eventsApi.mark(id, p.user_id, "absent", p.note))}
                        className={btn}><X className="w-3.5 h-3.5" /> {t("events.action.mark_absent")}</button>
                    )}
                    {p.status !== "registered" && (
                      <button disabled={busy} title={t("events.action.mark_registered")}
                        onClick={() => act(() => eventsApi.mark(id, p.user_id, "registered", p.note))}
                        className={btn}><Undo2 className="w-3.5 h-3.5" /> {t("events.action.mark_registered")}</button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
