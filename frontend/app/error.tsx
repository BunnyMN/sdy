"use client";

/**
 * A screen under this layout threw while rendering.
 *
 * Next requires the boundary to be a client component, and it hands it a
 * `reset` that re-renders the subtree — which is the "try again" the design
 * rule asks an error state to offer. The message it does NOT offer is the
 * exception: `error.message` in production is a digest, and in development a
 * stack, and neither is something to put in front of an operator. The digest is
 * kept as a quiet reference so a support call can be matched to the log entry
 * Sentry already holds.
 *
 * The shell still draws around this, so the reader keeps their navigation.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  // A <div>, not a <main>: the shell around this boundary already rendered the
  // page's one <main id="main">, and a second one nested inside it leaves a
  // screen reader's landmark list with two "main" entries.
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-[46rem] flex-col items-start gap-4 py-16"
    >
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-foreground">{t("base.error.crash_title")}</h1>
      <p className="text-sm text-muted">{t("base.error.crash_body")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
      >
        {t("base.action.retry")}
      </button>
      {error.digest && (
        <p className="font-mono text-xs text-muted">{error.digest}</p>
      )}
    </div>
  );
}
