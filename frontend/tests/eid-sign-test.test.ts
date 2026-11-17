// @vitest-environment node
//
// The eID signature test screen's pure half: the phone comes back to the test
// page, a session left running is resumed only while it can still answer, and
// every stage the API names has words.

import { expect, test } from "vitest";

import { events as dictionary } from "@/lib/i18n/addons/events";
import {
  SIGN_TEST_POLL_FOR, SIGN_TEST_STORAGE_KEY, forgetSession, readSavedSession, reportText, saveSession, signTestCallback, stageKey,
} from "@/lib/eidSignTest";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

test("the callback returns to the test page and keeps the browser hint", () => {
  expect(signTestCallback("https://e-sdy.mn", "?retScheme=googlechrome"))
    .toBe("https://e-sdy.mn/auth/eid/callback?return=%2Fmember%2Feid-test&retScheme=googlechrome");
  expect(signTestCallback("https://e-sdy.mn", "")).toBe("https://e-sdy.mn/auth/eid/callback?return=%2Fmember%2Feid-test");
});

test("a saved session resumes until the poll window closes", () => {
  const store = memory();
  saveSession(store, "abc", 1_000);
  expect(readSavedSession(store, 2_000)).toEqual({ session_id: "abc", started: 1_000 });
  expect(readSavedSession(store, 1_000 + SIGN_TEST_POLL_FOR + 1)).toBeNull();
  forgetSession(store);
  expect(readSavedSession(store, 2_000)).toBeNull();
  store.setItem(SIGN_TEST_STORAGE_KEY, "{not json");
  expect(readSavedSession(store, 2_000)).toBeNull();
});

test("every stage has Mongolian words", () => {
  const stages = ["signer_disabled", "identity_missing", "start_failed", "waiting", "poll_failed", "refused",
    "digest_unavailable", "digest_mismatch", "session_missing", "ok", "timeout", "network", "something_new"];
  for (const stage of stages) {
    const key = stageKey(stage) as keyof typeof dictionary;
    expect(dictionary[key]?.mn, stage).toBeTruthy();
  }
  expect(stageKey("something_new")).toBe("events.sign_test.stage.unknown");
});

test("the copied report names the stage and the detail", () => {
  const text = reportText({ stage: "start_failed", detail: "eidsign: eID answered 401", flow: "push", reg: "УБ****", session: "s1", at: "2026-11-17T00:00:00Z" });
  expect(text).toContain("stage: start_failed");
  expect(text).toContain("detail: eidsign: eID answered 401");
  expect(text).toContain("reg: УБ****");
  expect(text).not.toContain("eid_state");
});
