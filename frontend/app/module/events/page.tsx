"use client";

/**
 * Арга хэмжээний жагсаалт — удахгүй болох нь дээр, өнгөрсөн нь доор.
 *
 * Гишүүн бүр харна, бүртгүүлнэ (events.read); нэмэх, засах нь менежерийнх
 * (events.manage). Формын огноо нь хөтчийн datetime-local, сервер рүү
 * RFC 3339-өөр явна.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Plus, Users } from "lucide-react";

import { eventsApi, type EventInput, type EventRecord, type EventStatus } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Screen, Panel, Empty, ErrorNote, Chip, useAccess } from "@/components/module/kit";
import { LoadingBlock, Modal } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { EventForm, eventCounts, eventStatusTone, formatWhen } from "./shared";

export default function EventsPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const { allowed: canManage } = useAccess("events.manage");
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const [failed, setFailed] = useState("");
  const [filter, setFilter] = useState<EventStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed("");
    try {
      setEvents((await eventsApi.list(filter || undefined)).events);
    } catch (err: unknown) {
      setFailed(errorMessage(err));
      setEvents([]);
    }
  }, [filter, errorMessage]);

  useEffect(() => { void load(); }, [load]);

  async function create(input: EventInput) {
    setBusy(true);
    try {
      await eventsApi.create(input);
      setCreating(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = (events ?? []).filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = (events ?? []).filter((e) => new Date(e.starts_at).getTime() < now);

  const row = (e: EventRecord) => (
    <li key={e.id}>
      <Link href={`/module/events/${e.id}`} className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2 transition">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <strong className="text-sm text-foreground truncate">{e.title}</strong>
            <Chip tone={eventStatusTone[e.status]}>{t(`events.status.${e.status}`)}</Chip>
            {e.my_status && <Chip tone="emerald">{t(`events.attendance.${e.my_status}`)}</Chip>}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1 tabular-nums"><CalendarDays aria-hidden="true" className="w-3.5 h-3.5" />{formatWhen(e.starts_at)}</span>
            {e.location && <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="w-3.5 h-3.5" />{e.location}</span>}
            <span className="inline-flex items-center gap-1 tabular-nums"><Users aria-hidden="true" className="w-3.5 h-3.5" />{eventCounts(t, e)}</span>
          </span>
        </span>
      </Link>
    </li>
  );

  return (
    <Screen
      icon={<CalendarDays className="w-5 h-5" />}
      title={t("events.view.title")}
      subtitle={t("events.view.subtitle")}
      action={canManage ? (
        <button onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
          <Plus className="w-4 h-4" /> {t("events.action.create")}
        </button>
      ) : undefined}
    >
      {!canManage && <p className="text-xs text-muted">{t("events.message.read_only")}</p>}
      <div role="group" aria-label={t("events.field.status")} className="flex flex-wrap gap-2">
        {(["", "planned", "done", "cancelled"] as const).map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`min-h-11 rounded-full px-4 text-sm font-semibold border ${filter === s ? "bg-accent text-on-accent border-accent" : "border-line text-muted"}`}
          >
            {t(s ? `events.status.${s}` : "events.status.all")}
          </button>
        ))}
      </div>
      {failed && <div className="flex flex-wrap items-center gap-2"><ErrorNote>{failed}</ErrorNote>
        <button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-input px-4 text-sm">{t("membership.retry")}</button></div>}
      {events === null ? (
        <LoadingBlock label={t("events.message.loading")} />
      ) : failed ? null : events.length === 0 ? (
        <Empty icon={<CalendarDays className="w-10 h-10" />}>{t("events.message.empty")}</Empty>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <Panel>
              <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("events.view.upcoming")}</h2>
              <ul className="divide-y divide-line">{upcoming.map(row)}</ul>
            </Panel>
          )}
          {past.length > 0 && (
            <Panel>
              <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("events.view.past")}</h2>
              <ul className="divide-y divide-line">{past.map(row)}</ul>
            </Panel>
          )}
        </div>
      )}
      {creating && (
        <Modal onClose={() => setCreating(false)} size="lg">
          <EventForm onSave={create} onCancel={() => setCreating(false)} busy={busy} />
        </Modal>
      )}
    </Screen>
  );
}
