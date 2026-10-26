/**
 * One shape for every date, amount and number the platform shows.
 *
 * What was here before was `toLocaleString(locale)` at about sixty call sites,
 * on the reasoning that the browser knows where the reader is sitting. Two
 * things were wrong with that. The format: CLDR's `mn` renders
 * "2026 оны 9-р сарын 1, 14:20", which does not sort, does not line up in a
 * column, and reads differently in each of the seven languages this product
 * ships — in an audit log, where the whole point is comparing two rows, that is
 * a defect. And the zone: an operator in Ulaanbaatar and one on a laptop still
 * set to UTC were reading the same ledger entry as two different times, with
 * nothing on screen to say so.
 *
 * So both are fixed here. `yyyy-MM-dd HH:mm`, 24-hour, Asia/Ulaanbaatar — the
 * format Mongolian government and banking systems use, identical in every
 * language, and sortable as text. `Intl` is still what converts the instant
 * into that zone; it is only its opinion about layout that is not wanted, so
 * the parts are assembled here instead of being asked for whole.
 */

/** Mongolia is UTC+8 the year round — no daylight saving to track. */
export const TIME_ZONE = "Asia/Ulaanbaatar";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parts(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  const found: Record<string, string> = {};
  for (const part of PARTS.formatToParts(at)) found[part.type] = part.value;
  // `hour12: false` still yields "24" for midnight in some engines.
  if (found.hour === "24") found.hour = "00";
  return found;
}

/** `2026-09-01 14:20`, or an em dash when there is no usable value. */
export function formatMoment(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` : "";
}

/** `2026-09-01` — for columns where the time of day carries no information. */
export function formatDay(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

/**
 * `1,250,000` — comma thousands, dot decimal.
 *
 * Fixed to `en-US` grouping on purpose: `mn` CLDR agrees today, but a reader
 * who has switched the app to Russian should not start seeing `1 250 000` in
 * the same table as a colleague reading it in Mongolian.
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * `25,000₮` — symbol after the amount, no space.
 *
 * `Intl.NumberFormat('mn-MN', {style:'currency'})` puts the symbol in front,
 * because that is what CLDR records; Mongolian banking and government screens
 * put it behind, and this platform is one of those. A currency that is not the
 * tögrög keeps its ISO code and a space, which is the honest way to show one.
 */
export function formatMoney(amount: number, currency = "MNT"): string {
  if (!Number.isFinite(amount)) return "";
  const digits = Number.isInteger(amount) ? 0 : 2;
  const body = formatNumber(amount, digits);
  return currency === "MNT" ? `${body}₮` : `${body} ${currency}`;
}

/** `2026-09` — the month an instant falls in, in Ulaanbaatar. For `<input type="month">` defaults. */
export function monthOf(value: string | number | Date = new Date()): string {
  const p = parts(value);
  return p ? `${p.year}-${p.month}` : "";
}

/** `2026-09-01` — the day an instant falls in, in Ulaanbaatar. Comparable as text with a `due_date`. */
export function dayOf(value: string | number | Date = new Date()): string {
  const p = parts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : "";
}

/**
 * RFC 3339 → the value a `datetime-local` input wants, as Ulaanbaatar wall time.
 *
 * The browser's own zone is not used: an organiser on a laptop still set to
 * UTC used to see an 18:00 meeting as 10:00 in the edit form, and saving it
 * unchanged moved it by eight hours.
 */
export function toZonedInput(value: string | null | undefined): string {
  const p = parts(value);
  return p ? `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` : "";
}

/** A `datetime-local` value read as Ulaanbaatar wall time → RFC 3339 (UTC), or null for blank/invalid. */
export function fromZonedInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  // Mongolia is UTC+8 the year round, so the offset is a constant.
  const at = new Date(`${value.slice(0, 16)}:00+08:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** `4:05` — whole seconds as minutes and seconds, for a countdown. Negative reads as `0:00`. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "5 минутын өмнө" — how long ago, in the reader's language, for the last
 * week; the plain `yyyy-MM-dd HH:mm` after that, when "41 days ago" says less
 * than the date does.
 */
export function formatRelative(value: string | number | Date, locale: string, now = Date.now()): string {
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(at)) return "";
  const seconds = Math.round((at - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs >= 7 * 86400) return formatMoment(at);
  let format: Intl.RelativeTimeFormat;
  try {
    format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    return formatMoment(at);
  }
  if (abs < 60) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86400), "day");
}
