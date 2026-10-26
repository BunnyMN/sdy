/**
 * Date and time inputs, read and written in Ulaanbaatar time.
 *
 * `<input type="date">` and `<input type="datetime-local">` hold a wall-clock
 * value with no zone. `new Date("2026-09-01T09:00")` reads it in the
 * *browser's* zone, so an operator on a laptop still set to UTC who schedules
 * an announcement for 09:00 publishes it at 17:00 Ulaanbaatar time — while
 * every timestamp the console shows (lib/datetime.ts) is in Ulaanbaatar time.
 * The inputs follow the same rule as the display: the wall clock typed is the
 * wall clock in Asia/Ulaanbaatar, whatever the device thinks.
 *
 * Mongolia is UTC+8 the year round, with no daylight saving, so the offset is
 * a constant rather than a lookup.
 */

const UB_OFFSET = "+08:00";
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");

/** The UB wall-clock parts of an instant. */
function ubParts(value: string | number | Date) {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const shifted = new Date(at.getTime() + UB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: pad(shifted.getUTCMonth() + 1),
    day: pad(shifted.getUTCDate()),
    hour: pad(shifted.getUTCHours()),
    minute: pad(shifted.getUTCMinutes()),
  };
}

/**
 * `datetime-local` value (`2026-09-01T09:00`) typed in UB time → RFC 3339
 * instant (`2026-09-01T09:00:00+08:00`). Blank or malformed input gives "".
 */
export function ubLocalToISO(local: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!match) return "";
  return `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? "00"}${UB_OFFSET}`;
}

/**
 * `date` value (`2026-09-01`) → the instant that day *ends* in UB time
 * (`2026-09-01T23:59:59+08:00`), which is what an expiry date means: "valid
 * through the first of September". Pass `"start"` for the instant it begins.
 */
export function ubDateToISO(day: string, edge: "start" | "end" = "end"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.trim())) return "";
  return `${day.trim()}T${edge === "end" ? "23:59:59" : "00:00:00"}${UB_OFFSET}`;
}

/** An instant → the value a `datetime-local` input shows, in UB time. */
export function isoToUbLocal(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const p = ubParts(value);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : "";
}

/** An instant → the value a `date` input shows, in UB time. */
export function isoToUbDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const p = ubParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

/** Whole days from now until `value` (negative once it has passed); null when unreadable. */
export function daysUntil(value: string | number | Date | null | undefined, now: number = Date.now()): number | null {
  if (value === null || value === undefined || value === "") return null;
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return Math.ceil((at.getTime() - now) / (24 * 60 * 60 * 1000));
}
