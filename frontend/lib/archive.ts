/**
 * The pure half of the archive screens: words for kinds and states, the
 * signer list a manager builds, the phone's round trip to the eID app, and
 * what each API refusal means to a member.
 */
import type { ArchiveKind, ArchiveStatus, SignerCandidate } from "@/lib/api/archive";

export const ARCHIVE_PATH = "/member/archive";
export const ARCHIVE_KINDS: ArchiveKind[] = ["minutes", "decision", "vote_protocol"];
export const ARCHIVE_STATUSES: ArchiveStatus[] = ["draft", "signing", "signed", "cancelled"];
export const ARCHIVE_SIGN_STORAGE_KEY = "sdy.archive-sign";
export const ARCHIVE_POLL_EVERY = 2000;
export const ARCHIVE_POLL_FOR = 5 * 60_000;
/** A 502 while polling is eID still stamping; this many in a row and the member is asked to retry. */
export const ARCHIVE_POLL_502_LIMIT = 5;

export const kindKey = (kind: string) => `events.archive.kind.${ARCHIVE_KINDS.includes(kind as ArchiveKind) ? kind : "minutes"}`;
export const statusKey = (status: string) => `events.archive.status.${ARCHIVE_STATUSES.includes(status as ArchiveStatus) ? status : "draft"}`;

export function statusTone(status: ArchiveStatus): "neutral" | "warning" | "success" | "danger" {
  return status === "signed" ? "success" : status === "signing" ? "warning" : status === "cancelled" ? "danger" : "neutral";
}

/** Signers chosen so far, in order, plus who to add — without duplicates, the existing order kept. */
export function addSigners<T extends Pick<SignerCandidate, "user_id">>(current: T[], more: T[]): T[] {
  const seen = new Set(current.map(s => s.user_id));
  const out = [...current];
  for (const s of more) if (!seen.has(s.user_id)) { seen.add(s.user_id); out.push(s); }
  return out;
}

/** «Бүх тэргүүлэгч + Тэргүүн + Нарийн бичиг»: the chair and the secretary first, then the board. */
export function boardWithOfficers<T extends Pick<SignerCandidate, "user_id">>(c: { board: T[]; officers: T[] }): T[] {
  return addSigners(addSigners([] as T[], c.officers), c.board);
}

/** Moves one signer up (-1) or down (+1); out of range leaves the list as it was. */
export function moveSigner<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** The callback the eID app returns the phone to, which then sends it back to the document. */
export function archiveCallback(origin: string, documentID: string, hint: string): string {
  const back = encodeURIComponent(`${ARCHIVE_PATH}/${documentID}`);
  return `${origin}/auth/eid/callback?return=${back}${hint.replace("?", "&")}`;
}

type Saved = { document_id: string; session_id: string; started: number };

export function saveSignSession(storage: Pick<Storage, "setItem">, documentID: string, sessionID: string, started = Date.now()) {
  try { storage.setItem(ARCHIVE_SIGN_STORAGE_KEY, JSON.stringify({ document_id: documentID, session_id: sessionID, started })); } catch { /* private mode */ }
}

/** The ceremony left running for this document when the page handed the phone to the eID app. */
export function readSignSession(storage: Pick<Storage, "getItem">, documentID: string, now = Date.now()): Saved | null {
  try {
    const raw = storage.getItem(ARCHIVE_SIGN_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Saved>;
    if (s.document_id !== documentID || typeof s.session_id !== "string" || typeof s.started !== "number") return null;
    return now - s.started < ARCHIVE_POLL_FOR ? { document_id: s.document_id, session_id: s.session_id, started: s.started } : null;
  } catch {
    return null;
  }
}

export function forgetSignSession(storage: Pick<Storage, "removeItem">) {
  try { storage.removeItem(ARCHIVE_SIGN_STORAGE_KEY); } catch { /* private mode */ }
}

/** What one poll answer means for the waiting screen. */
export type PollStep = "wait" | "signed" | "failed";
export function pollStep(state: string): PollStep {
  return state === "signed" ? "signed" : state === "signing" ? "wait" : "failed";
}

/** The API's stable English refusals, to this screen's words. */
const KNOWN: Record<string, string> = {
  "it is not your turn to sign this document": "events.archive.error.not_your_turn",
  "sign in with eid mongolia once so you can sign documents": "events.archive.error.no_eid",
  "this document is not out for signature": "events.archive.error.not_out",
  "every signer must be an active member of this branch": "events.archive.error.signer_inactive",
  "choose who signs the document first": "events.archive.error.no_signers",
  "eid could not return the signed pdf; try again": "events.archive.error.stamp",
  "eid returned a pdf that is not an added signature on this document": "events.archive.error.not_incremental",
  "the signature does not cover this document": "events.archive.error.digest",
  "give a reason for cancelling a document out for signature": "events.archive.error.reason",
  "only a draft can be edited": "events.archive.error.not_draft",
  "only a draft can be sent for signature": "events.archive.error.not_draft",
  "the document changed while the signature was starting; try again": "events.archive.error.changed",
  "eid signing is not available on this installation": "events.archive.error.signing_off",
  "this installation cannot sign pdf documents": "events.archive.error.signing_off",
  "eid mongolia could not start the signature": "events.archive.error.start",
  "a signed or cancelled document cannot be cancelled": "events.archive.error.final",
  "give a reason for changing the signers": "events.archive.error.replace_reason",
  "name who signs instead": "events.archive.error.replace_none",
  "a new signer has already signed this document": "events.archive.error.replace_signed",
};

/** The i18n key for a known refusal, or "" to fall back to the shared error text. */
export function archiveErrorKey(err: unknown): string {
  const message = (err as { message?: unknown })?.message;
  return typeof message === "string" ? KNOWN[message.trim().toLowerCase()] ?? "" : "";
}

/** «2/5» — how far the signatures have got. */
export function progressText(signed: number, total: number): string {
  return `${Math.max(0, signed)}/${Math.max(0, total)}`;
}
