/**
 * The signed archive's API (mn.sdy.events 1.7.0, backend/internal/apps/events
 * archive*.go): minutes, decisions and vote protocols that every required
 * person signs with eID PIN2, in turn.
 */
import { request } from "./client";
import { apiBase } from "@/lib/apiBase";

export type ArchiveKind = "minutes" | "decision" | "vote_protocol";
export type ArchiveStatus = "draft" | "signing" | "signed" | "cancelled";
export type SignerStatus = "pending" | "signing" | "signed" | "refused" | "replaced";

export type ArchiveSigner = {
  user_id: string; name: string; position_title: string; order: number; status: SignerStatus;
  signed_at: string | null; cert_name: string; cert_serial: string; cert_issuer: string;
  has_eid: boolean; current: boolean; last_error?: string; replace_reason?: string;
};
export type ArchiveVersion = { revision: number; sha256: string; size: number; signer_user_id: string | null; signer_name: string; created_at: string };

export type ArchiveDocument = {
  id: string; kind: ArchiveKind; kind_title: string; number: string; title: string; body: string;
  event_id: string | null; event_title: string; motion_id: string | null; status: ArchiveStatus; draft_reason: string; notice: string;
  created_by: string; created_by_name: string; created_at: string; updated_at: string;
  issued_at: string | null; signed_at: string | null; cancelled_at: string | null; cancel_reason: string;
  pdf_sha256: string; final_sha256: string; signer_count: number; signed_count: number; revisions: number;
  current_signer: string | null; my_turn: boolean; can_manage: boolean;
  signers?: ArchiveSigner[]; versions?: ArchiveVersion[];
};

export type ArchiveList = {
  documents: ArchiveDocument[]; has_more: boolean; next_offset: number | null; todo: number;
  can_manage: boolean; signing_ready: boolean;
};

export type ArchiveFilter = { kind?: ArchiveKind | ""; status?: ArchiveStatus | ""; mine?: "todo" | "signer" | ""; offset?: number };
export type ArchiveInput = { kind: ArchiveKind; title: string; body: string; event_id: string | null; signers: string[] };

export type SignerCandidate = { user_id: string; name: string; email: string; position: string; position_title: string; has_eid: boolean };
export type SignerCandidates = { board: SignerCandidate[]; officers: SignerCandidate[]; members: SignerCandidate[] };

export type SignStart = { session_id: string; verification_code: string; app_link?: string; state: string };
export type SignPoll = { state: "signing" | "signed" | "failed" | "pending"; document_status: ArchiveStatus; reason?: string };

const one = (id: string) => `/archive/${encodeURIComponent(id)}`;
const post = (body?: unknown) => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function archiveQuery(filter: ArchiveFilter): string {
  const q = new URLSearchParams();
  if (filter.kind) q.set("kind", filter.kind);
  if (filter.status) q.set("status", filter.status);
  if (filter.mine) q.set("mine", filter.mine);
  if (filter.offset) q.set("offset", String(filter.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const archiveApi = {
  list: (filter: ArchiveFilter = {}) => request<ArchiveList>(`/archive${archiveQuery(filter)}`),
  get: (id: string) => request<{ document: ArchiveDocument; signing_ready: boolean }>(one(id)),
  create: (input: ArchiveInput) => request<{ document: ArchiveDocument }>("/archive", post(input)),
  update: (id: string, input: ArchiveInput) => request<{ document: ArchiveDocument }>(one(id), { method: "PUT", body: JSON.stringify(input) }),
  send: (id: string) => request<{ document: ArchiveDocument }>(`${one(id)}/send`, post()),
  cancel: (id: string, reason: string) => request<{ document: ArchiveDocument }>(`${one(id)}/cancel`, post({ reason })),
  /** Who still has to sign, while the document is out: the open signers are replaced by these, in order. */
  replaceSigners: (id: string, signers: string[], reason: string) =>
    request<{ document: ArchiveDocument }>(`${one(id)}/signers`, { method: "PUT", body: JSON.stringify({ signers, reason }) }),
  candidates: (q = "") => request<SignerCandidates>(`/archive/signers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  /** callbackUrl, from a phone: the answer's app_link opens the eID app, which returns there. */
  sign: (id: string, callbackUrl = "") => request<SignStart>(`${one(id)}/sign`, post({ callback_url: callbackUrl })),
  /** An empty sessionID asks about the caller's own ceremony on the document. */
  poll: (id: string, sessionID = "") => request<SignPoll>(`${one(id)}/sign/poll`, post({ session_id: sessionID })),
};

/** Where a PDF is downloaded from: the latest revision, or one revision. Same origin, so the session cookie goes along. */
export function archivePdfUrl(id: string, options: { revision?: number; inline?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (options.revision !== undefined) q.set("revision", String(options.revision));
  if (options.inline) q.set("inline", "1");
  const s = q.toString();
  return `${apiBase()}${one(id)}/pdf${s ? `?${s}` : ""}`;
}

/** A member's signed ballot for one motion (their own, or anyone's where the roll is visible). */
export function ballotUrl(eventID: string, motionID: string, userID?: string): string {
  const base = `${apiBase()}/events/${encodeURIComponent(eventID)}/motions/${encodeURIComponent(motionID)}`;
  return userID ? `${base}/votes/${encodeURIComponent(userID)}/ballot` : `${base}/ballot`;
}
