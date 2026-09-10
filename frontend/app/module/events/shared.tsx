"use client";

/**
 * Арга хэмжээний хоёр дэлгэцийн дундын хэсэг: форм, огнооны хөрвүүлэлт,
 * төлвийн өнгө. page.tsx-ээс тусад нь — Next-ийн хуудасны файл зөвхөн
 * хуудсаа экспортолдог.
 */

import { useId, useState } from "react";

import type { EventInput, EventRecord, EventStatus } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { ErrorNote } from "@/components/module/kit";
import { fieldClass, selectClass } from "@/components/ui";

export const eventStatusTone: Record<EventStatus, "slate" | "emerald" | "amber" | "rose" | "blue"> = {
  planned: "blue",
  done: "emerald",
  cancelled: "rose",
};

/** RFC 3339 → the value a datetime-local input wants (local wall time). */
export function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → RFC 3339 in UTC, or null for blank. */
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function formatWhen(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale === "mn" ? "mn-MN" : locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function EventForm({ initial, onSave, onCancel, busy }: {
  initial?: EventRecord;
  onSave: (input: EventInput) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const formID = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.ends_at ?? null));
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [points, setPoints] = useState(String(initial?.points_value ?? 0));
  const [status, setStatus] = useState<EventStatus>(initial?.status ?? "planned");
  const [failed, setFailed] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailed("");
    const starts = fromLocalInput(startsAt);
    if (!starts) { setFailed(t("events.field.starts_at")); return; }
    try {
      await onSave({
        title: title.trim(), description: description.trim(), location: location.trim(),
        starts_at: starts, ends_at: fromLocalInput(endsAt),
        capacity: capacity.trim() ? Number(capacity) : null, status, points_value: Number(points),
      });
    } catch (err: unknown) {
      setFailed(err instanceof Error ? err.message : "—");
    }
  }

  const label = "block text-xs font-semibold text-muted mb-1";
  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{initial ? t("events.view.edit_title") : t("events.view.new_title")}</h2>
      <div>
        <label htmlFor={`${formID}-title`} className={label}>{t("events.field.title")}</label>
        <input id={`${formID}-title`} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
      </div>
      <div>
        <label htmlFor={`${formID}-description`} className={label}>{t("events.field.description")}</label>
        <textarea id={`${formID}-description`} maxLength={10000} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={fieldClass} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formID}-starts`} className={label}>{t("events.field.starts_at")}</label>
          <input id={`${formID}-starts`} required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${formID}-ends`} className={label}>{t("events.field.ends_at")}</label>
          <input id={`${formID}-ends`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${formID}-location`} className={label}>{t("events.field.location")}</label>
          <input id={`${formID}-location`} maxLength={500} value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${formID}-capacity`} className={label}>{t("events.field.capacity")} <span className="font-normal">({t("events.field.capacity_hint")})</span></label>
          <input id={`${formID}-capacity`} type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={fieldClass} />
        </div>
        {initial && (
          <div>
            <label htmlFor={`${formID}-status`} className={label}>{t("events.field.status")}</label>
            <select id={`${formID}-status`} value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className={selectClass}>
              {(["planned", "done", "cancelled"] as EventStatus[]).map((s) => (
                <option key={s} value={s}>{t(`events.status.${s}`)}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${formID}-points`} className={label}>{t("events.field.points")}</label>
          <input id={`${formID}-points`} type="number" required min={0} max={100000} step={1} value={points} onChange={e => setPoints(e.target.value)} className={fieldClass} />
          <p className="mt-1 text-xs text-muted">{t("events.field.points_hint")}</p>
        </div>
      </div>
      {failed && <ErrorNote>{failed}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted">
          {t("events.action.cancel")}
        </button>
        <button disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">
          {t("events.action.save")}
        </button>
      </div>
    </form>
  );
}
