"use client";

/**
 * errorText() with the reader's language already applied.
 *
 *   const errorMessage = useErrorMessage();
 *   try { … } catch (err) { setError(errorMessage(err)); }
 *
 *   // with a screen's own vocabulary and a better default than "something went wrong":
 *   const errorMessage = useErrorMessage({
 *     codes: { branch_transfer_required: "membership.branch_transfer_required" },
 *     fallback: "membership.transfer_failed",
 *   });
 *
 * Its own file, apart from lib/errorMessage.ts, because the API clients import
 * that one and they must not pull a client-only React module in with it.
 */

import { useCallback } from "react";

import { useI18n } from "@/lib/i18n";
import { errorText, type ErrorTextOptions } from "@/lib/errorMessage";

export function useErrorMessage(defaults: Omit<ErrorTextOptions, "locale"> = {}) {
  const { t, locale } = useI18n();
  const { codes, fallback } = defaults;
  return useCallback(
    (err: unknown, options: Omit<ErrorTextOptions, "locale"> = {}) =>
      errorText(err, t, { locale, codes, fallback, ...options }),
    [t, locale, codes, fallback],
  );
}
