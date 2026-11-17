// The archive screens' pure half: the filter query, the signer list a manager
// builds, the phone's round trip to the eID app, poll states and the words for
// every refusal the API sends.

import { describe, expect, it, test } from "vitest";

import { archiveQuery, archivePdfUrl, ballotUrl } from "@/lib/api/archive";
import {
  ARCHIVE_POLL_FOR, ARCHIVE_SIGN_STORAGE_KEY, addSigners, boardWithOfficers, archiveCallback, archiveErrorKey, forgetSignSession,
  kindKey, moveSigner, pollStep, progressText, readSignSession, saveSignSession, statusKey, statusTone,
} from "@/lib/archive";
import "@/lib/i18n/apps/events";
import { lookup } from "@/lib/i18n/registry";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

test("the list query carries only the filters that are set", () => {
  expect(archiveQuery({})).toBe("");
  expect(archiveQuery({ kind: "minutes", status: "", mine: "todo", offset: 50 })).toBe("?kind=minutes&mine=todo&offset=50");
});

test("PDF and ballot links stay on the API's own origin", () => {
  expect(archivePdfUrl("abc")).toBe("/api/v1/archive/abc/pdf");
  expect(archivePdfUrl("abc", { revision: 2, inline: true })).toBe("/api/v1/archive/abc/pdf?revision=2&inline=1");
  expect(ballotUrl("e1", "m1")).toBe("/api/v1/events/e1/motions/m1/ballot");
  expect(ballotUrl("e1", "m1", "u1")).toBe("/api/v1/events/e1/motions/m1/votes/u1/ballot");
});

test("a preset adds people once, after those already chosen, in its own order", () => {
  const a = { user_id: "a" }, b = { user_id: "b" }, c = { user_id: "c" };
  expect(addSigners([b], [a, b, c])).toEqual([b, a, c]);
  expect(addSigners([], [])).toEqual([]);
});

test("signers move up and down, and never off the list", () => {
  expect(moveSigner(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  expect(moveSigner(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  const list = ["a", "b"];
  expect(moveSigner(list, 0, -1)).toBe(list);
  expect(moveSigner(list, 1, 1)).toBe(list);
});

test("the phone returns to the document it was signing", () => {
  expect(archiveCallback("https://e-sdy.mn", "doc1", "?retScheme=googlechrome"))
    .toBe("https://e-sdy.mn/auth/eid/callback?return=%2Fmember%2Farchive%2Fdoc1&retScheme=googlechrome");
});

test("a saved ceremony resumes only on its own document and only while it can answer", () => {
  const store = memory();
  saveSignSession(store, "doc1", "s1", 1_000);
  expect(readSignSession(store, "doc1", 2_000)).toEqual({ document_id: "doc1", session_id: "s1", started: 1_000 });
  expect(readSignSession(store, "doc2", 2_000)).toBeNull();
  expect(readSignSession(store, "doc1", 1_000 + ARCHIVE_POLL_FOR + 1)).toBeNull();
  forgetSignSession(store);
  expect(readSignSession(store, "doc1", 2_000)).toBeNull();
  store.setItem(ARCHIVE_SIGN_STORAGE_KEY, "{bad");
  expect(readSignSession(store, "doc1", 2_000)).toBeNull();
});

test("poll states: signing waits, signed ends, anything else failed", () => {
  expect(pollStep("signing")).toBe("wait");
  expect(pollStep("signed")).toBe("signed");
  expect(pollStep("failed")).toBe("failed");
  expect(pollStep("pending")).toBe("failed");
});

test("the API's refusals have Mongolian words; unknown ones fall through", () => {
  for (const message of [
    "it is not your turn to sign this document", "sign in with eID Mongolia once so you can sign documents",
    "this document is not out for signature", "every signer must be an active member of this branch",
    "choose who signs the document first", "eID could not return the signed PDF; try again",
    "eID returned a PDF that is not an added signature on this document", "the signature does not cover this document",
    "give a reason for cancelling a document out for signature",
  ]) {
    const key = archiveErrorKey(new Error(message));
    expect(key, message).not.toBe("");
    expect(lookup("mn", key), key).toBeTruthy();
  }
  expect(archiveErrorKey(new Error("something else"))).toBe("");
  expect(archiveErrorKey(null)).toBe("");
});

test("every kind, status and signer state has words and a tone", () => {
  for (const k of ["minutes", "decision", "vote_protocol"]) expect(lookup("mn", kindKey(k))).toBeTruthy();
  for (const s of ["draft", "signing", "signed", "cancelled"] as const) {
    expect(lookup("mn", statusKey(s))).toBeTruthy();
    expect(statusTone(s)).toBeTruthy();
  }
  for (const s of ["pending", "signing", "signed", "refused", "current"]) expect(lookup("mn", `events.archive.signer.${s}`)).toBeTruthy();
  expect(progressText(2, 5)).toBe("2/5");
});

describe("the combined signer preset", () => {
  it("puts the chair and the secretary first, then the board, without duplicates", () => {
    const officers = [{ user_id: "chair" }, { user_id: "secretary" }];
    const board = [{ user_id: "b1" }, { user_id: "chair" }, { user_id: "b2" }];
    expect(boardWithOfficers({ board, officers }).map(s => s.user_id)).toEqual(["chair", "secretary", "b1", "b2"]);
    expect(boardWithOfficers({ board: [], officers: [] })).toEqual([]);
  });
  it("maps the replace refusals to words", () => {
    for (const message of ["give a reason for changing the signers", "name who signs instead", "a new signer has already signed this document"]) {
      expect(archiveErrorKey({ message })).not.toBe("");
    }
  });
});

