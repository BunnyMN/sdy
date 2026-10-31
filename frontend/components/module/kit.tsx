"use client";

/**
 * The kit every /module/* screen is built from.
 *
 * These screens are contributed by installed apps and all have the same shape:
 * a titled header, panels, an empty state, an error line, chips and a confirm
 * dialog. Sharing them keeps a warehouse list and an audit table looking like
 * one product rather than eight.
 */

import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  Badge,
  ConfirmDialog as UIConfirmDialog,
  ErrorNote as UIErrorNote,
  Loading as UILoading,
  Modal as UIModal,
  type BadgeTone,
} from "@/components/ui";

export { useAccess, ReadOnlyNote } from "@/lib/permissions";
// The copy button and its hook are the shared ones now: the tick waits for the
// clipboard to say yes, and a refusal is shown rather than hidden. Same names,
// same props, so every module screen keeps its import.
export { CopyButton, useCopy } from "@/components/ui";

export function Screen({ icon, title, subtitle, action, children }: {
  icon: React.ReactNode; title: string; subtitle: string;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="w-10 h-10 rounded-xl bg-accent-soft text-accent grid place-content-center shrink-0">
            {icon}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted mt-0.5 max-w-2xl">{subtitle}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`bg-surface border border-line rounded-xl ${className}`}>{children}</section>;
}

export function Empty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-12 text-center border border-dashed border-input rounded-xl bg-surface">
      <span aria-hidden="true" className="text-subtle grid place-content-center mb-3">{icon}</span>
      <p className="text-sm text-muted max-w-md mx-auto">{children}</p>
    </div>
  );
}

/** The shared Loading, centred in the panel the way the module screens drew it. */
export function Loading({ label }: { label: string }) {
  return <UILoading label={label} className="p-12 justify-center" />;
}

/** The shared ErrorNote: status tokens, and announced with role="alert". */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <UIErrorNote>{children}</UIErrorNote>;
}

// The kit's colour names, onto the shared tones. `slate` stays the quiet one.
const CHIP_TONE: Record<"slate" | "blue" | "amber" | "emerald" | "rose", BadgeTone> = {
  slate: "neutral",
  blue: "info",
  amber: "warning",
  emerald: "success",
  rose: "danger",
};

export function Chip({ children, tone = "slate", mono }: {
  children: React.ReactNode; tone?: "slate" | "blue" | "amber" | "emerald" | "rose"; mono?: boolean;
}) {
  // A chip carries identifiers — client ids, redirect URIs — so it wraps
  // anywhere rather than pushing the row wider, and stays squarer than a badge.
  return (
    <Badge tone={CHIP_TONE[tone]} mono={mono} className="text-2xs rounded break-all">
      {children}
    </Badge>
  );
}

/**
 * The module dialogs' shell, now the same one every other dialog uses.
 *
 * It had its own copy: a dimmed backdrop with `backdrop-blur-sm`, no focus
 * trap, no Escape, and a z-index picked by hand. The blur was the visible half
 * of the problem — glass surfaces are on the design system's forbidden list —
 * and the missing trap was the real one: Tab walked straight out of an open
 * dialog into the page behind it. Delegating keeps the X, which these dialogs
 * do want, and inherits the rest.
 */
export function Modal({ children, onClose, label, dismissible }: {
  children: React.ReactNode; onClose: () => void;
  /** The dialog's name for a screen reader — pass the heading's text. */
  label?: string;
  /** False for a dialog Escape and the backdrop must not close (a one-time secret). */
  dismissible?: boolean;
}) {
  const { t } = useI18n();
  return (
    <UIModal onClose={onClose} label={label} dismissible={dismissible} scrollable className="my-8">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 grid h-11 w-11 place-items-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover"
        aria-label={t("base.action.close")}
      >
        <X aria-hidden="true" className="w-4 h-4" />
      </button>
      {children}
    </UIModal>
  );
}

/**
 * The shared ConfirmDialog (components/ui/confirm.tsx), with the kit's props.
 * `danger` picks the tone; `busy` and `requireText` pass through. A screen that
 * needs a reason box uses the shared one directly.
 */
export function ConfirmDialog({ title, body, confirmLabel, danger, onCancel, onConfirm, busy, requireText }: {
  title: string; body: string; confirmLabel: string; danger?: boolean;
  onCancel: () => void; onConfirm: () => void; busy?: boolean; requireText?: string;
}) {
  return (
    <UIConfirmDialog
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      tone={danger ? "danger" : "default"}
      busy={busy}
      requireText={requireText}
      onCancel={onCancel}
      onConfirm={() => onConfirm()}
    />
  );
}

/** relative renders a timestamp as "3 days ago", or a fallback when absent. */
export function relativeDate(value: string | undefined, fallback: string, locale: string) {
  if (!value) return fallback;
  const then = new Date(value).getTime();
  const days = Math.round((then - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return fallback;
  const rtf = new Intl.RelativeTimeFormat(locale === "mn" ? "mn" : "en", { numeric: "auto" });
  if (Math.abs(days) < 1) return rtf.format(Math.round((then - Date.now()) / 3_600_000), "hour");
  return rtf.format(days, "day");
}


