/**
 * What a failed request says to the person who made it.
 *
 * The API answers in English — `{"error": "this event is full"}` — because it
 * is read by logs, other services and developers as much as by people. Screens
 * used to put that sentence straight on the page, so a member checking in on a
 * Mongolian screen was told "the check-in code is invalid or expired", and a
 * dropped connection read "Failed to fetch". Each screen that noticed wrote its
 * own small mapping (MembershipTransfers' transferErrorMessage is the pattern
 * this grew from); most did not notice.
 *
 * This is the one place that answer is chosen, in this order:
 *
 *   1. a code or message the caller says it knows (`codes`),
 *   2. a sentence the platform's own handlers are known to send (KNOWN below),
 *   3. a network failure — fetch rejected, nothing came back,
 *   4. a server sentence already in the reader's script (some handlers answer
 *      in Mongolian, and that is better than any generic line),
 *   5. the HTTP status,
 *   6. the caller's `fallback`, or a generic "something went wrong".
 *
 * The raw server text is never shown in a Mongolian screen unless it is
 * Mongolian. It stays on the error object — `errorDetail()` reads it back — for
 * a "details" disclosure or a support ticket.
 */

import { base } from "@/lib/i18n/base";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locale";
import type { DictionaryKey, TranslationKey } from "@/lib/i18n";

/** The translate function as screens hold it; `useI18n().t` fits. */
export type Translate = (key: DictionaryKey, vars?: Record<string, string | number>) => string;

/**
 * A failed request, with what is needed to explain it.
 *
 * `status` is the HTTP status, or 0 when nothing came back at all. `code` is
 * the API's machine-readable reason when it sends one. Both clients
 * (lib/api/client.ts and lib/cp.ts) throw this, so `err.status` is always
 * there to read — the console's polling loops already depended on it.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Sentences the platform's handlers send, by what they mean.
 *
 * Exact, lower-cased matches; PREFIXES below for the few that append a
 * reason. Adding one costs a line here and nothing at the call sites — a
 * screen already passing its errors through errorText() picks it up.
 */
const KNOWN: Record<string, TranslationKey> = {
  // auth/handlers.go, cp sign-in
  "invalid email or password": "base.error.invalid_credentials",
  "the e-mail address, password or code was not right": "base.error.invalid_credentials",
  "session is invalid or expired": "base.error.unauthorized",
  "operator session is invalid or expired": "base.error.unauthorized",
  unauthorized: "base.error.unauthorized",
  // apps/events/checkin.go
  "the check-in code is invalid or expired": "base.error.checkin_invalid",
  "invalid check-in code": "base.error.checkin_invalid",
  "register for an open event before checking in": "base.error.checkin_not_registered",
  // apps/events/events.go
  "this event is full": "base.error.event_full",
  // apps/events/discussions.go
  "you have already voted on this issue": "base.error.already_voted",
  "the vote on this issue has already been opened or closed": "base.error.vote_closed",
  // workspace/identity/handlers.go, binding.go
  "eid session expired": "base.error.eid_expired",
  "eid identity verification failed": "base.error.eid_failed",
  "e-id verification failed": "base.error.eid_failed",
  "eid mongolia session could not be started": "base.error.eid_unavailable",
  "eid mongolia session check failed": "base.error.eid_unavailable",
  // links that are single-use or time-limited
  "this link has expired": "base.error.link_expired",
  "that link has already been used or has expired": "base.error.link_expired",
  "that handover has already been used or has expired": "base.error.link_expired",
};

/** Sentences that arrive with a reason appended after a colon. */
const PREFIXES: Array<[string, TranslationKey]> = [
  ["dan.gerege.mn verification failed", "base.error.eid_failed"],
];

/** By HTTP status, when the sentence itself is not one we know. */
function statusKey(status: number): TranslationKey | undefined {
  switch (status) {
    case 0:
      return "base.error.network";
    case 400:
      return "base.error.bad_request";
    case 401:
      return "base.error.unauthorized";
    case 403:
      return "base.error.forbidden";
    case 404:
      return "base.error.not_found";
    case 409:
      return "base.error.conflict";
    case 410:
      return "base.error.gone";
    case 413:
      return "base.error.too_large";
    case 422:
      return "base.error.validation";
    case 429:
      return "base.error.rate_limited";
    case 502:
    case 503:
    case 504:
      return "base.error.unavailable";
    default:
      return status >= 500 && status < 600 ? "base.error.server" : undefined;
  }
}

interface Parts {
  status?: number;
  code?: string;
  message: string;
  network: boolean;
}

function partsOf(err: unknown): Parts {
  if (typeof err === "string") return { message: err, network: false };
  if (!err || typeof err !== "object") return { message: "", network: false };
  const value = err as { status?: unknown; code?: unknown; message?: unknown; name?: unknown };
  const status = typeof value.status === "number" ? value.status : undefined;
  const code = typeof value.code === "string" ? value.code : undefined;
  const message = typeof value.message === "string" ? value.message : "";
  // fetch() rejects with a TypeError whose wording is the browser's own:
  // "Failed to fetch" (Chromium), "NetworkError when attempting to fetch
  // resource." (Firefox), "Load failed" (Safari).
  const network =
    status === 0 ||
    code === "network" ||
    (err instanceof TypeError && /fetch|network|load failed/i.test(message));
  return { status, code, message, network };
}

/** Whether a failure is "nothing came back" rather than an answer. */
export function isNetworkError(err: unknown): boolean {
  return partsOf(err).network;
}

/** The raw server text, for a details disclosure or a log line. Never a headline. */
export function errorDetail(err: unknown): string {
  const { status, message } = partsOf(err);
  return [status ? `HTTP ${status}` : "", message].filter(Boolean).join(" · ");
}

export interface ErrorTextOptions {
  /** The reader's language; a server sentence in Mongolian passes through only for "mn". */
  locale?: Locale | string;
  /**
   * What this screen knows that the platform does not: an API code or exact
   * message, mapped to a key. Checked first. A module's own codes go here —
   * `{ transfer_pending: "membership.transfer_pending" }`.
   */
  codes?: Record<string, DictionaryKey>;
  /** What to say when nothing more specific is known. Defaults to base.error.unknown. */
  fallback?: DictionaryKey;
}

/** Steps 1–2: a code or sentence somebody has given a meaning to. */
function specificKey({ code, message }: Parts, codes?: Record<string, DictionaryKey>): DictionaryKey | undefined {
  const lowered = message.trim().toLowerCase();
  if (codes) {
    if (code && codes[code]) return codes[code];
    if (message && codes[message]) return codes[message];
  }
  if (lowered && KNOWN[lowered]) return KNOWN[lowered];
  return PREFIXES.find(([prefix]) => lowered.startsWith(prefix))?.[1];
}

/**
 * The dictionary key errorText would use, for screens that need to branch on
 * it — show a "sign in again" button for base.error.unauthorized, say. It
 * skips step 4 (a Mongolian server sentence), which has no key.
 */
export function errorKey(err: unknown, options: Omit<ErrorTextOptions, "locale"> = {}): DictionaryKey {
  const parts = partsOf(err);
  const specific = specificKey(parts, options.codes);
  if (specific) return specific;
  if (parts.network) return "base.error.network";
  const byStatus = parts.status !== undefined ? statusKey(parts.status) : undefined;
  return byStatus || options.fallback || "base.error.unknown";
}

const CYRILLIC = /[\u0400-\u04FF]/;

/**
 * A failed request, as a sentence in the reader's language.
 *
 *   catch (err) { setError(errorText(err, t, { locale })) }
 *
 * Prefer `useErrorMessage()` (lib/useErrorMessage.ts) inside a component; this
 * is for code that already has `t` in hand.
 */
export function errorText(err: unknown, t: Translate, options: ErrorTextOptions = {}): string {
  const parts = partsOf(err);
  const specific = specificKey(parts, options.codes);
  if (specific) return t(specific);
  // Some handlers already answer in Mongolian ("Регистрийн дугаар олдсонгүй…"),
  // and a specific sentence in the reader's language beats a generic one.
  if (!parts.network && (options.locale ?? DEFAULT_LOCALE) === "mn" && CYRILLIC.test(parts.message)) {
    return parts.message;
  }
  return t(errorKey(err, options));
}

/**
 * The same, in the platform's two authored languages, without React.
 *
 * For the two API clients: they build the Error a screen may still render as
 * `err.message`, and until every screen goes through errorText() that message
 * should at least not be "Request failed". Reads the language from <html lang>,
 * which I18nProvider keeps in step. Mongolian reads Mongolian; every other
 * language reads English, which is what `t()` falls back to for them too.
 */
export function fallbackErrorText(status: number, locale?: string): string {
  const lang =
    locale ||
    (typeof document !== "undefined" ? document.documentElement.lang : "") ||
    DEFAULT_LOCALE;
  const key = statusKey(status) || "base.error.unknown";
  const entry = base[key as keyof typeof base] as { mn: string; en: string };
  return lang === "mn" ? entry.mn : entry.en;
}
