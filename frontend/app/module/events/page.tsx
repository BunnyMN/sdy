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
import { Screen, Panel, Empty, Loading, ErrorNote, Chip, useAccess } from "@/components/module/kit";
import { Modal } from "@/components/ui";
import { EventForm, eventStatusTone, formatWhen } from "./shared";

export default function EventsPage() {
  const { t, locale } = useI18n();
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
      setFailed(err instanceof Error ? err.message : "—");
      setEvents([]);
    }
  }, [filter]);

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
      <Link href={`/module/events/${e.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2 transition">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <strong className="text-sm text-foreground truncate">{e.title}</strong>
            <Chip tone={eventStatusTone[e.status]}>{t(`events.status.${e.status}`)}</Chip>
            {e.my_status && <Chip tone="emerald">{t(`events.attendance.${e.my_status}`)}</Chip>}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatWhen(e.starts_at, locale)}</span>
            {e.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{e.location}</span>}
            <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />
              {t("events.message.counts", { registered: e.registered, attended: e.attended })}
              {e.capacity ? ` / ${e.capacity}` : ""}
            </span>
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
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
          <Plus className="w-4 h-4" /> {t("events.action.create")}
        </button>
      ) : undefined}
    >
      {!canManage && <p className="text-xs text-muted">{t("events.message.read_only")}</p>}
      <div className="flex gap-1">
        {(["", "planned", "done", "cancelled"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold border ${filter === s ? "bg-accent text-on-accent border-accent" : "border-line text-muted"}`}
          >
            {t(s ? `events.status.${s}` : "events.status.all")}
          </button>
        ))}
      </div>
      {failed && <ErrorNote>{failed}</ErrorNote>}
      {events === null ? (
        <Loading label={t("events.message.loading")} />
      ) : events.length === 0 ? (
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
