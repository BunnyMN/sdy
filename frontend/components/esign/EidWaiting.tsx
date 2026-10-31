"use client";

import React, { useEffect, useId, useState } from "react";
import { Building2, FileText, RotateCcw, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * What the citizen looks at while their phone holds the ceremony: the
 * verification code to compare, what to do with it, and how long is left.
 *
 * Both eID entry points draw this — the "Sign now" tab inline, and the
 * register's per-row button inside a dialog — so the two cannot drift apart on
 * what a waiting signer is told.
 */

/** Seconds left until `expiresAt`, ticking once a second; null when unknown. */
export function useCountdown(expiresAt?: string | null): number | null {
  const target = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Number.isNaN(target)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.round((target - now) / 1000));
}

/** 125 → "2:05". */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function EidWaitingPanel({
  code,
  filename,
  orgName,
  expiresAt,
  onCancel,
  cancelling = false,
  headingId,
}: {
  code?: string | null;
  filename?: string;
  orgName?: string;
  expiresAt?: string | null;
  onCancel: () => void;
  cancelling?: boolean;
  headingId?: string;
}) {
  const { t } = useI18n();
  const left = useCountdown(expiresAt);
  const codeLabelId = `${useId()}-code`;
  // Announced once a minute rather than every second: a live region that
  // speaks every tick drowns out everything else on the page.
  const spoken = left === null ? null : Math.ceil(left / 60);

  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent-soft text-accent inline-flex items-center justify-center">
        <Smartphone aria-hidden="true" className="w-7 h-7" />
      </div>
      <h2 id={headingId} className="text-lg font-semibold text-foreground mt-3.5">
        {t("esign.view.confirm_on_phone")}
      </h2>
      {filename && (
        <p className="text-sm text-muted mt-1 inline-flex items-center gap-1.5">
          <FileText aria-hidden="true" className="w-3.5 h-3.5" />
          {filename}
        </p>
      )}
      {orgName && (
        <p className="text-sm text-accent mt-1 flex items-center justify-center gap-1.5">
          <Building2 aria-hidden="true" className="w-3.5 h-3.5" />
          {t("esign.message.on_behalf_of", { org: orgName })}
        </p>
      )}

      {code && (
        <>
          <p id={codeLabelId} className="text-2xs uppercase tracking-[0.18em] text-muted mt-5">
            {t("esign.field.verification_code")}
          </p>
          <div className="flex justify-center gap-2.5 mt-2" role="group" aria-labelledby={codeLabelId}>
            <span className="sr-only">{code.split("").join(" ")}</span>
            {code.split("").map((digit, index) => (
              <span
                key={index}
                aria-hidden="true"
                className="w-11 h-14 inline-flex items-center justify-center text-2xl font-semibold font-mono text-accent bg-surface-2 rounded-xl"
              >
                {digit}
              </span>
            ))}
          </div>
        </>
      )}

      <ol className="text-sm text-muted mt-5 max-w-sm mx-auto leading-relaxed text-left list-decimal pl-5 space-y-1">
        <li>{t("esign.eid.step_open_app")}</li>
        <li>{t("esign.eid.step_compare_code")}</li>
        <li>{t("esign.message.pin2_instruction")}</li>
      </ol>

      <div role="status" aria-live="polite" className="mt-4 text-xs text-muted">
        {left !== null && (
          <>
            <span aria-hidden="true" className={`font-mono ${left <= 30 ? "text-warning font-semibold" : ""}`}>
              {left > 0 ? t("esign.eid.expires_in", { time: formatCountdown(left) }) : t("esign.eid.expiring")}
            </span>
            <span className="sr-only">
              {left > 0 ? t("esign.eid.expires_in_minutes", { minutes: spoken ?? 0 }) : t("esign.eid.expiring")}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        className="mt-4 min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
        {t("base.action.cancel")}
      </button>
    </div>
  );
}
