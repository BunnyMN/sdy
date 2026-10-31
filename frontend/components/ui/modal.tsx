"use client";

import React from "react";
import { useI18n } from "@/lib/i18n";

/**
 * Dialog plumbing: the focus rules every layer shares, and the centred Modal
 * built on them.
 *
 * Moved out of components/ui/index.tsx when the shell's own layers — the
 * mobile "More" sheet and the native shell's search — needed the same trap the
 * Modal had. They are not Modals (one is a bottom sheet, one a command
 * palette), so what is shared is the hook, and the Modal is its first user.
 * index.tsx re-exports everything here, so `@/components/ui` still answers.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** The tabbable elements of an open dialog, in tab order, skipping hidden ones. */
function focusableWithin(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Hold focus inside a layer while it is open.
 *
 * Takes focus on open (the panel itself, unless something inside already has
 * it — React's autoFocus runs before effects), hands it back to the opener on
 * close, keeps Tab and Shift+Tab inside, and calls `onEscape` on Escape. The
 * panel needs `tabIndex={-1}` so it can hold focus itself.
 *
 *   const panel = useRef<HTMLDivElement>(null);
 *   const onKeyDown = useDialogFocus(panel, { onEscape: close });
 *   return <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" onKeyDown={onKeyDown}>…</div>;
 *
 * `active: false` suspends it for a layer that stays mounted while hidden.
 */
export function useDialogFocus(
  panelRef: React.RefObject<HTMLElement | null>,
  { onEscape, active = true }: { onEscape?: () => void; active?: boolean } = {},
) {
  React.useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    // Test against the panel rather than focusing it unconditionally, because
    // by the time this runs something inside may already hold focus: React
    // does not render autoFocus as an attribute, it calls focus() during
    // commit, which is before any effect here. A caller that asks for a field
    // gets that field; the rest get the panel.
    if (panel?.contains(document.activeElement)) return;
    // The panel and not its first field: focusing an input would skip past the
    // heading a screen reader announces on entry, and these dialogs open on a
    // title, not on a cursor.
    const opener = document.activeElement as HTMLElement | null;
    panel?.focus();
    // Back to whatever opened the dialog, so closing one from a table row does
    // not drop the operator at the top of the page. A no-op if that row has
    // since been re-rendered away.
    return () => opener?.focus?.();
  }, [active, panelRef]);

  return React.useCallback(
    (event: React.KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Escape" && onEscape) {
        // stopPropagation so a dialog opened from inside another overlay does
        // not close both on one press.
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      const items = focusableWithin(panel);
      if (items.length === 0) {
        // Nothing to move to, so the only correct move is to stay put rather
        // than let the browser send focus out to the page behind.
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [active, onEscape, panelRef],
  );
}

/**
 * Whether anything inside has been typed into since the dialog opened.
 *
 * The comparison is against `defaultValue`, so a field the dialog prefilled
 * does not count and a field the operator edited does. Checkboxes and radios
 * are compared the same way through `defaultChecked`. It is what decides
 * whether a dismissal throws work away or asks first.
 */
function holdsTypedInput(panel: HTMLElement | null) {
  if (!panel) return false;
  const fields = panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select",
  );
  for (const field of fields) {
    if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      if (field.checked !== field.defaultChecked) return true;
    } else if (field instanceof HTMLSelectElement) {
      // A <select> has no defaultValue; the option marked selected in the
      // markup is the one it opened on.
      const opened = Array.from(field.options).find((option) => option.defaultSelected);
      if (field.value !== (opened?.value ?? field.options[0]?.value ?? "")) return true;
    } else if (field.value !== field.defaultValue) {
      return true;
    }
  }
  return false;
}

/**
 * Warn before the tab is closed or reloaded while `dirty`.
 *
 * The browser shows its own wording — the text of the event has been ignored
 * everywhere for years — so there is nothing to translate. It does not cover a
 * client-side navigation inside the app; a screen that needs that asks with
 * useConfirm() before calling router.push.
 */
export function useUnsavedChanges(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome before 119 still needs returnValue set to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/**
 * A centred dialog over a dimmed page.
 *
 * Escape closes it, and so does a click on the backdrop — unless something has
 * been typed into it, in which case either one asks "discard changes?" first.
 * The earlier versions answered that case two different ways: the backdrop
 * was ignored (so a stray click lost nothing) but Escape closed silently (so
 * a reflexive key press lost a half-written reason). Asking is the one answer
 * that keeps both the work and the way out. `dirty` overrides the guess when
 * the dialog knows better — a ConfirmDialog's reason box is not worth asking
 * about, a multi-step form's state may live outside any <input>.
 *
 * Both need somewhere to go: a dialog without `onClose` keeps the old
 * behaviour, because there is nothing to call. `dismissible={false}` turns both
 * off for a dialog that must be closed through its own button — a one-time
 * secret, which is gone for good the moment the dialog is.
 *
 * Holding focus is a different question, and the answer to that one is yes —
 * see useDialogFocus above. The twelve originals left focus on the button that
 * opened them, so Tab walked the page behind the dimmed backdrop: with the
 * signing dialog open on /documents a keyboard operator could tab to a
 * *different* row and press its Reject.
 */
export function Modal({
  size = "md",
  scrollable = false,
  className,
  label,
  onClose,
  dismissible = true,
  dirty,
  children,
}: {
  size?: "md" | "lg";
  /**
   * Let the backdrop scroll instead of the panel. The signing dialog needs it:
   * it grows with the number of steps, and a panel taller than the window
   * otherwise puts its own buttons past the bottom edge with no way to reach
   * them. Pair it with a vertical margin on the panel, or the top of a tall
   * dialog is clipped by the centring.
   */
  scrollable?: boolean;
  /** Extra panel classes. Height and scrolling genuinely differ per dialog. */
  className?: string;
  /**
   * What the dialog is called, announced on open. Pass the same string the
   * dialog's own heading shows — a role of "dialog" with no name announces as
   * just "dialog", which tells the operator less than the heading they cannot
   * see yet.
   */
  label?: string;
  /**
   * Dismiss the dialog. Without it Escape and the backdrop do nothing, which
   * is what every dialog here did before this prop existed.
   */
  onClose?: () => void;
  /** False: Escape and the backdrop do nothing; only the dialog's own buttons close it. */
  dismissible?: boolean;
  /**
   * Whether dismissing would throw work away. Left undefined, the dialog
   * compares its fields against their defaults; true or false says so outright.
   */
  dirty?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const keepRef = React.useRef<HTMLButtonElement>(null);
  const [askingDiscard, setAskingDiscard] = React.useState(false);

  const canDismiss = dismissible && !!onClose;

  const requestClose = React.useCallback(() => {
    if (!canDismiss) return;
    if (askingDiscard) {
      // Escape on the question answers it the cautious way.
      setAskingDiscard(false);
      return;
    }
    if (dirty !== undefined ? dirty : holdsTypedInput(panelRef.current)) {
      setAskingDiscard(true);
      return;
    }
    onClose?.();
  }, [askingDiscard, canDismiss, onClose, dirty]);

  const handleKeyDown = useDialogFocus(panelRef, { onEscape: canDismiss ? requestClose : undefined });

  // While the question is up, what it covers is out of reach: inert, so Tab
  // cannot walk into the half-filled form underneath it. Set on the DOM rather
  // than by wrapping `children`, because callers lay the panel out with their
  // own flex and grid classes and an extra wrapper would break them.
  React.useEffect(() => {
    if (!askingDiscard) return;
    const panel = panelRef.current;
    const covered = Array.from(panel?.children ?? []).filter((el) => !el.hasAttribute("data-discard-prompt"));
    covered.forEach((el) => el.setAttribute("inert", ""));
    keepRef.current?.focus();
    return () => covered.forEach((el) => el.removeAttribute("inert"));
  }, [askingDiscard]);

  function handleBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    // Only the backdrop itself — a click that started inside the panel and
    // ended on it (a drag out of a text selection) must not close anything.
    if (event.target !== event.currentTarget) return;
    requestClose();
  }

  return (
    <div
      onMouseDown={handleBackdrop}
      className={`fixed inset-0 bg-overlay flex items-center justify-center z-modal p-4${
        scrollable ? " overflow-y-auto" : ""
      }`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative bg-surface rounded-xl ${size === "lg" ? "max-w-lg" : "max-w-md"} w-full p-6 shadow-lg border border-line${
          className ? ` ${className}` : ""
        }`}
      >
        {children}
        {askingDiscard && (
          // Inside the panel rather than a second Modal: the focus trap above
          // already covers it, and a dialog stacked on a dialog is one more
          // layer for a screen reader to lose its place in.
          <div
            data-discard-prompt=""
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="gerege-discard-title"
            aria-describedby="gerege-discard-body"
            className="absolute inset-0 z-10 flex flex-col justify-center gap-3 rounded-xl bg-surface p-6"
          >
            <h2 id="gerege-discard-title" className="text-lg font-semibold text-foreground">
              {t("base.confirm.discard_title")}
            </h2>
            <p id="gerege-discard-body" className="text-sm text-muted">
              {t("base.confirm.discard_body")}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                ref={keepRef}
                type="button"
                onClick={() => setAskingDiscard(false)}
                className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-foreground hover:bg-surface-hover"
              >
                {t("base.action.keep_editing")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAskingDiscard(false);
                  onClose?.();
                }}
                className="min-h-11 rounded-lg bg-danger-solid px-4 text-sm font-semibold text-white hover:brightness-110"
              >
                {t("base.action.discard")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
