import { describe, expect, it } from "vitest";

import { contactEmail, SDY_CONTACT_EMAIL } from "@/components/legal/LegalPage";
import { sentryPrivacy } from "@/lib/sentryPrivacy";

describe("the contact address on /privacy and /support", () => {
  it("is the configured one when it is an address", () => {
    expect(contactEmail({ LEGAL_CONTACT_EMAIL: " office@sdy.example " } as unknown as NodeJS.ProcessEnv)).toBe("office@sdy.example");
  });
  it("keeps the default when unset, empty or not an address", () => {
    for (const value of [undefined, "", "   ", "not-an-address", "a@b", 'x@y.mn"><script>']) {
      expect(contactEmail({ LEGAL_CONTACT_EMAIL: value } as unknown as NodeJS.ProcessEnv)).toBe(SDY_CONTACT_EMAIL);
    }
  });
});

describe("what the error reporter may collect", () => {
  it("says nothing-about-the-person to SDK 10 and SDK 11 alike", () => {
    expect(sentryPrivacy.sendDefaultPii).toBe(false);
    expect(sentryPrivacy.dataCollection).toEqual({ userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false });
  });
});
