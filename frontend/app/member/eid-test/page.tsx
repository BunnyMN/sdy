"use client";

import EIDSignTest from "@/components/events/EIDSignTest";
import { useI18n } from "@/lib/i18n";

// The member's own eID (PIN2) signature test. The eID app returns the phone
// here (lib/eidSignTest.ts SIGN_TEST_PATH), so the path is part of the flow.
export default function EIDSignTestPage() {
  const { t } = useI18n();
  return <div className="mx-auto max-w-[720px] space-y-5 pb-6">
    <header><h1>{t("events.sign_test.page_title")}</h1><p className="mt-2 text-sm text-muted">{t("events.sign_test.page_hint")}</p></header>
    <EIDSignTest />
  </div>;
}
