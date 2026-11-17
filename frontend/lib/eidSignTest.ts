/**
 * The pure half of the eID signature test screen: where the phone returns,
 * the session it resumes, and what each stage means to a member.
 */
import type { SignTestStage } from "@/lib/api/events";

export const SIGN_TEST_PATH = "/member/eid-test";
export const SIGN_TEST_STORAGE_KEY = "sdy.eid-sign-test";
export const SIGN_TEST_POLL_EVERY = 2000;
export const SIGN_TEST_POLL_FOR = 5 * 60_000;

/** The callback the eID app returns the phone to, which then sends it back here. */
export function signTestCallback(origin: string, hint: string): string {
  const back = encodeURIComponent(SIGN_TEST_PATH);
  return `${origin}/auth/eid/callback?return=${back}${hint.replace("?", "&")}`;
}

type Saved = { session_id: string; started: number };

/** The session left running when the page handed the phone to the eID app. */
export function readSavedSession(storage: Pick<Storage, "getItem">, now = Date.now()): Saved | null {
  try {
    const raw = storage.getItem(SIGN_TEST_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (typeof saved.session_id !== "string" || typeof saved.started !== "number") return null;
    return now - saved.started < SIGN_TEST_POLL_FOR ? { session_id: saved.session_id, started: saved.started } : null;
  } catch {
    return null;
  }
}

export function saveSession(storage: Pick<Storage, "setItem">, sessionID: string, started = Date.now()) {
  try { storage.setItem(SIGN_TEST_STORAGE_KEY, JSON.stringify({ session_id: sessionID, started })); } catch { /* private mode */ }
}

export function forgetSession(storage: Pick<Storage, "removeItem">) {
  try { storage.removeItem(SIGN_TEST_STORAGE_KEY); } catch { /* private mode */ }
}

const KNOWN: SignTestStage[] = ["signer_disabled", "identity_missing", "start_failed", "waiting", "poll_failed",
  "refused", "digest_unavailable", "digest_mismatch", "session_missing", "ok"];

/** The i18n key that explains a stage; "timeout" and "network" are this page's own. */
export function stageKey(stage: string): string {
  return KNOWN.includes(stage as SignTestStage) || stage === "timeout" || stage === "network"
    ? `events.sign_test.stage.${stage}` : "events.sign_test.stage.unknown";
}

/** The text a member copies to send us: everything we need, nothing secret. */
export function reportText(input: { stage: string; detail: string; eidState?: string; flow?: string; reg?: string; session?: string; at: string }): string {
  return [
    `E-sdy eID PIN2 test — ${input.at}`,
    `stage: ${input.stage}`,
    input.eidState ? `eid_state: ${input.eidState}` : "",
    input.flow ? `flow: ${input.flow}` : "",
    input.reg ? `reg: ${input.reg}` : "",
    input.session ? `session: ${input.session}` : "",
    `detail: ${input.detail || "—"}`,
  ].filter(Boolean).join("\n");
}
