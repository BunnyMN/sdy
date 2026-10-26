/**
 * What a failed request says to a person.
 *
 * The API answers in English for logs and developers; a Mongolian screen must
 * not hand that sentence to a member. These pin the order lib/errorMessage.ts
 * chooses in — a known sentence, a dropped connection, a Mongolian server
 * sentence, the status, the caller's fallback — and that the core client
 * gives it something to work with when fetch itself rejects.
 */

import { afterEach, expect, test, vi } from "vitest";

import { ApiError, errorKey, errorText, fallbackErrorText, isNetworkError } from "@/lib/errorMessage";
import { request } from "@/lib/api/client";

/** Every key answers as itself, as in tests/helpers/i18n.tsx. */
const t = (key: string) => key;

afterEach(() => vi.unstubAllGlobals());

test("a sentence the backend is known to send becomes the reader's own", () => {
  // The member flows: check-in, a full event, a second vote, eID, sign-in.
  const cases: Array<[string, number, string]> = [
    ["the check-in code is invalid or expired", 409, "base.error.checkin_invalid"],
    ["invalid check-in code", 400, "base.error.checkin_invalid"],
    ["register for an open event before checking in", 409, "base.error.checkin_not_registered"],
    ["this event is full", 409, "base.error.event_full"],
    ["you have already voted on this issue", 409, "base.error.already_voted"],
    ["eID session expired", 404, "base.error.eid_expired"],
    ["eID identity verification failed", 401, "base.error.eid_failed"],
    ["dan.gerege.mn verification failed: upstream said no", 401, "base.error.eid_failed"],
    ["invalid email or password", 401, "base.error.invalid_credentials"],
  ];
  for (const [message, status, key] of cases) {
    expect(errorText(new ApiError(message, status), t, { locale: "mn" })).toBe(key);
  }
});

test("an unknown English sentence falls back to its status, never to itself", () => {
  const statuses: Array<[number, string]> = [
    [400, "base.error.bad_request"],
    [401, "base.error.unauthorized"],
    [403, "base.error.forbidden"],
    [404, "base.error.not_found"],
    [409, "base.error.conflict"],
    [410, "base.error.gone"],
    [413, "base.error.too_large"],
    [422, "base.error.validation"],
    [429, "base.error.rate_limited"],
    [500, "base.error.server"],
    [503, "base.error.unavailable"],
  ];
  for (const [status, key] of statuses) {
    const text = errorText(new ApiError("some internal reason nobody mapped", status), t, { locale: "mn" });
    expect(text).toBe(key);
    expect(text).not.toContain("internal reason");
  }
});

test("fetch's own TypeError is a dropped connection, in any browser's wording", () => {
  for (const wording of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
    const err = new TypeError(wording);
    expect(isNetworkError(err)).toBe(true);
    expect(errorText(err, t)).toBe("base.error.network");
  }
});

test("a Mongolian server sentence is kept for a Mongolian reader, and only for one", () => {
  const err = new ApiError("Регистрийн дугаар олдсонгүй", 400);
  expect(errorText(err, t, { locale: "mn" })).toBe("Регистрийн дугаар олдсонгүй");
  expect(errorText(err, t, { locale: "en" })).toBe("base.error.bad_request");
});

test("a screen's own codes come first, and its fallback last", () => {
  const codes = { transfer_pending: "membership.transfer_pending" };
  expect(errorText(new ApiError("transfer_pending", 409), t, { codes })).toBe("membership.transfer_pending");
  expect(errorText(new Error("whatever"), t, { fallback: "membership.transfer_failed" })).toBe(
    "membership.transfer_failed",
  );
  expect(errorKey("not even an Error")).toBe("base.error.unknown");
});

test("the client reports a rejected fetch as status 0, in the page's language", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));

  const failure = await request("/me").catch((err: unknown) => err);

  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ status: 0, code: "network" });
  expect((failure as Error).message).toBe(fallbackErrorText(0, "mn"));
  expect((failure as Error).message).not.toMatch(/fetch/i);
});

test("the client keeps the server's sentence on the error and the status beside it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "this event is full" }) })),
  );

  const failure = await request("/events/1/register").catch((err: unknown) => err);

  expect(failure).toMatchObject({ status: 409, message: "this event is full" });
  expect(errorText(failure, t, { locale: "mn" })).toBe("base.error.event_full");
});
