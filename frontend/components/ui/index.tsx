"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// The dialogs, the copy button and the file picker live in files of their own
// and are re-exported, so every screen keeps importing from "@/components/ui".
export { Modal, useDialogFocus, useUnsavedChanges } from "./modal";
export { CopyButton, copyText, useCopy } from "./copy";
export {
  ConfirmDialog,
  ConfirmProvider,
  SecretRevealDialog,
  useConfirm,
  type ConfirmDialogProps,
  type ConfirmOptions,
  type ConfirmTone,
} from "./confirm";
export { FileDropzone, fileAccepted, formatBytes } from "./file";

/**
 * The chrome every module screen is built from.
 *
 * Documents, E-Sign and Gov Services each grew their own copy of these four:
 * three PageHeaders that were identical character for character, three Banners
 * that differed only in padding and the shade of red, and two EmptyStates that
 * disagreed about whether the text is centred. Three copies of a header is not
 * three decisions — it is one decision recorded three times, and the screens had
 * already started to drift apart on it.
 *
 * Anything domain-specific stays in the module's own shared.tsx. What lands here
 * is what a screen needs regardless of which app it belongs to.
 */

export function PageHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h1>
        <p className="text-sm text-muted mt-1">{subtitle}</p>
      </div>
      {actions}
    </header>
  );
}

export type BannerTone = "error" | "success" | "info" | "warning";

// The status tokens rather than Tailwind's red/emerald/blue/amber: those are
// fixed colours, so a banner stayed a pale pastel strip in dark mode. Every
// fg×soft pair here is ≥4.5:1 in both modes (see globals.css).
const BANNER_STYLE: Record<BannerTone, string> = {
  error: "bg-danger-soft border-danger-border text-danger",
  success: "bg-success-soft border-success-border text-success",
  info: "bg-info-soft border-info-border text-info",
  // Not an outcome but a standing condition the screen cannot fix: no service
  // key, no encryption key. The settings screens had this in amber already.
  warning: "bg-warning-soft border-warning-border text-warning",
};

/**
 * What a screen says after an action, good or bad.
 *
 * onDismiss is optional because the two cases are genuinely different: a banner
 * reporting the outcome of something the operator pressed should be dismissable,
 * and one stating a standing condition of the screen — mock mode, a signature
 * placed off the page — should not be, because dismissing it would not make it
 * untrue.
 */
export function Banner({
  tone,
  message,
  onDismiss,
  children,
}: {
  tone: BannerTone;
  /** The sentence. `children` may be passed instead, for a banner holding a link. */
  message?: React.ReactNode;
  onDismiss?: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    // A role so a screen reader announces the outcome of an action the user
    // cannot see the result of. The settings screens already did this; the rest
    // did not, and the answer to that disagreement is the accessible one.
    //
    // Failures get "alert" rather than "status" because the two are not the
    // same urgency: "status" is polite, so it waits for whatever the region is
    // already saying to finish. A failed create on /documents renders its
    // banner just as the loading text changes, and queued behind that the
    // operator hears nothing and believes the document was created.
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`p-3 border text-sm rounded-lg flex items-start gap-2 ${BANNER_STYLE[tone]}`}
    >
      {tone === "error" || tone === "warning" ? (
        <AlertTriangle aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" />
      ) : tone === "info" ? (
        <Info aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <span className="flex-1 min-w-0 break-words">{message ?? children}</span>
      {onDismiss && (
        // type="button" because the default is "submit": every call site today
        // happens to sit outside a <form>, and the first one that does not
        // would otherwise submit the form on its way to dismissing the banner.
        //
        // 44px to press, though the icon is 16: a thumb on a phone hit the
        // banner's text more often than its 16px cross. The negative margins
        // give the extra back so the banner is no taller for it.
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("base.action.close")}
          className="-my-3 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Loading({ label, className = "" }: { label?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-center gap-2 text-muted text-sm ${className}`} role="status">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      {label || t("base.message.loading")}
    </div>
  );
}

/**
 * Whether a wait has gone on long enough to be worth drawing, and — once it
 * has been drawn — long enough not to flash.
 *
 * Two numbers, both about the same thing: a placeholder that appears and
 * vanishes inside a fifth of a second is visual noise, not feedback. So
 * nothing is shown for the first 300ms, and once something *is* shown it stays
 * for at least 500ms even if the data has already arrived. A fast response
 * therefore renders straight to content, and a slow one does not blink on its
 * way there.
 */
export function useSettledWait(waiting: boolean): boolean {
  const [showing, setShowing] = React.useState(false);
  const shownAt = React.useRef(0);

  React.useEffect(() => {
    if (waiting) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShowing(true);
      }, 300);
      return () => clearTimeout(timer);
    }
    if (!showing) return;
    const remaining = 500 - (Date.now() - shownAt.current);
    if (remaining <= 0) {
      setShowing(false);
      return;
    }
    const timer = setTimeout(() => setShowing(false), remaining);
    return () => clearTimeout(timer);
  }, [waiting, showing]);

  return showing;
}

/**
 * A grey bar standing in for a line of content that has not arrived.
 *
 * It takes the shape of what it replaces rather than being a spinner in the
 * middle of the page, so nothing moves when the real thing lands.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded bg-surface-2${className ? ` ${className}` : ""}`}
    />
  );
}

/**
 * What a screen has to say when there is nothing to show.
 *
 * The two cases are not one case. A list that has never had anything in it is
 * the first thing a new operator sees, and it has a job: say what would go
 * here and offer the button that puts something there. A list that is empty
 * because of a filter has the opposite job — the records exist, the reader
 * hid them, and what they need is the way back. Showing the first screen's
 * copy in the second situation tells somebody to create a record they already
 * have.
 *
 * `message` alone still works and reads as it did, so the screens that have
 * not been given the fuller treatment are unaffected.
 */
export function EmptyState({
  message,
  title,
  action,
  filtered,
}: {
  message: string;
  /** A heading above the sentence. Worth it for a first-run screen. */
  title?: string;
  /** The way forward: "New…" when first-run, "Clear filters" when filtered. */
  action?: React.ReactNode;
  /** Nothing matched a filter, as opposed to nothing existing at all. */
  filtered?: boolean;
}) {
  if (!title && !action) {
    // The original shape, minus the italics: italic Cyrillic is harder to read
    // than upright, and the sentence was already muted and centred.
    return <p className={`text-sm text-muted text-center ${filtered ? "py-10" : "p-6"}`}>{message}</p>;
  }
  return (
    <div className={`flex flex-col items-center gap-2 text-center ${filtered ? "py-10" : "py-12"}`}>
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      <p className="max-w-prose text-sm text-muted">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * The shapes below are style, not structure, so they are exported as class
 * strings rather than wrapped in components. A form field is an <input> on one
 * screen, a <select> on the next and a <textarea> on a third, all of them
 * carrying their own props; a component that took all of those would be a
 * worse <input>. What was actually duplicated is the look, and a name for the
 * look is enough to stop it drifting.
 */

/** Text, number, select and textarea inputs. Repeated 33 times before this. */
export const fieldClass =
  "w-full px-3 py-2 text-sm border border-input rounded-lg";

/**
 * A <select> wearing fieldClass alone renders SHORTER than the input beside
 * it: the vertical padding that gives an input its height is not honoured by
 * the native control on every browser, macOS Safari most visibly. The height
 * an input reaches implicitly — text-sm line + py-2 + borders — is stated
 * explicitly here, so a select in a form row sits flush with its neighbours.
 */
export const selectClass = `${fieldClass} h-[38px] bg-surface`;

/** The white panel a section sits on. */
export const cardClass = "bg-surface rounded-xl border border-line";

/** The header row of a listing table. */
export const tableHeadClass =
  "bg-surface-2 text-foreground font-semibold border-b border-line uppercase";

/**
 * The small bordered button in a table row: Save, Use template, and friends.
 * The accent rather than indigo — indigo was a second brand hue that did not
 * follow the chosen accent and was 2.9:1 on a dark row.
 */
export const rowActionClass =
  "inline-flex items-center space-x-1 px-2.5 py-1.5 min-h-9 rounded-lg text-2xs font-semibold " +
  "border border-input text-accent hover:bg-accent-soft disabled:opacity-50";

/**
 * What a listing shows while its first load is outstanding.
 *
 * Rows of the right shape rather than the word "Loading…" centred in an empty
 * box: the height is the height the list will have, so the page does not jump
 * when the rows arrive. It is held back for 300ms and, once drawn, held for
 * 500 — see `useSettledWait` — so a fast reply renders straight to content.
 *
 * The label is still announced, because a skeleton says nothing to a screen
 * reader.
 */
export function LoadingBlock({ label, rows = 4 }: { label?: string; rows?: number }) {
  const { t } = useI18n();
  const showing = useSettledWait(true);
  if (!showing) return null;
  return (
    <div className="py-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label || t("base.message.loading")}</span>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A listing table on its panel, with the header row the caller supplies. */
export function TableCard({
  head,
  footer,
  children,
}: {
  head: React.ReactNode;
  /**
   * Rendered inside the panel, below the table. This is where the lists put
   * "these rows are stale" and their Load more button — both of them statements
   * about the table, so they belong on the same piece of paper as it.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`${cardClass} overflow-hidden`}>
      {/* Scrolls sideways rather than clipping: a six-column table on a 375px
          phone used to lose its last columns — usually the actions — behind
          the panel's rounded edge with no way to reach them. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-muted">
          <thead className={tableHeadClass}>{head}</thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

// ─── Status, panels and plain tables ────────────────────────────────────────
//
// The console (components/cp/ui.tsx) and the module kit
// (components/module/kit.tsx) each had their own badge, card and table, in
// Tailwind's fixed palette. They are adapters onto these now.

export type BadgeTone = "danger" | "success" | "warning" | "info" | "neutral" | "accent";

const BADGE_STYLE: Record<BadgeTone, string> = {
  danger: "bg-danger-soft text-danger border-danger-border",
  success: "bg-success-soft text-success border-success-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  info: "bg-info-soft text-info border-info-border",
  neutral: "bg-neutral-soft text-neutral border-neutral-border",
  accent: "bg-accent-soft text-accent border-transparent",
};

/** A short status word on a tinted pill. Every tone is ≥4.5:1 in both modes. */
export function Badge({
  tone = "neutral",
  children,
  mono = false,
  className = "",
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${BADGE_STYLE[tone]}${
        mono ? " font-mono" : ""
      }${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}

/** A titled panel. `title` is the section's heading, `action` sits at its right. */
export function Card({
  title,
  action,
  children,
  className = "",
  headingLevel = 2,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={`${cardClass} overflow-hidden${className ? ` ${className}` : ""}`}>
      {(title || action) && (
        <div className="px-4 py-3 border-b border-line flex items-center gap-3">
          <Heading className="flex-1 min-w-0 font-medium text-foreground">{title}</Heading>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A plain data table: header strings, rows of cells, and what to say when
 * there are none.
 *
 * Scrolls sideways on a narrow screen, keeps its header row in view while the
 * page scrolls (`sticky`), and marks header cells `scope="col"` so a screen
 * reader names the column when it reads a cell. While `loading`, the empty
 * row shows skeleton lines instead of "nothing here" — an empty message
 * flashed before the first answer tells somebody their records are gone.
 */
export function Table({
  head,
  rows,
  empty,
  loading = false,
  caption,
  rowKey,
  sticky = true,
  maxHeight,
}: {
  head: React.ReactNode[];
  rows: React.ReactNode[][];
  empty: React.ReactNode;
  loading?: boolean;
  /** A visually hidden caption naming the table for a screen reader. */
  caption?: string;
  rowKey?: (row: React.ReactNode[], index: number) => React.Key;
  /**
   * Keep the header row in view. A sticky header sticks to its nearest
   * scrolling box, and the sideways-scroll wrapper is one — so it only holds
   * while scrolling *that* box, which is what `maxHeight` gives it. Without a
   * maxHeight the table grows with its rows and the page scrolls instead.
   */
  sticky?: boolean;
  /** A CSS length; the table scrolls inside it and the header stays put. */
  maxHeight?: string;
}) {
  return (
    <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={`bg-surface-2 text-muted${sticky ? " sticky top-0 z-[1]" : ""}`}>
          <tr>
            {head.map((cell, index) => (
              <th key={index} scope="col" className="text-left font-medium px-4 py-2.5 whitespace-nowrap">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : index} className="hover:bg-surface-hover">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-4 py-8 text-center text-muted">
                {loading ? <LoadingBlock rows={3} /> : empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * An error line inside a panel or form — the kit's ErrorNote, on tokens and
 * announced. `role="alert"` because it usually appears in answer to something
 * the reader just pressed.
 */
export function ErrorNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={`text-sm text-danger bg-danger-soft border border-danger-border rounded-lg px-3 py-2 flex items-start gap-2${
        className ? ` ${className}` : ""
      }`}
    >
      <AlertTriangle aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
