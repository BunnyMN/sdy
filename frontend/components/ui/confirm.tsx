"use client";

import React from "react";
import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Modal } from "./modal";
import { CopyButton } from "./copy";

/**
 * Asking before doing something that cannot be taken back.
 *
 * Three shapes, one dialog:
 *
 *   - a plain question — "Delete this key?" with Cancel / Delete;
 *   - a typed confirmation (`requireText`) for the irreversible ones, where a
 *     reflexive Enter must not be enough — the button stays disabled until the
 *     name is typed;
 *   - a reason (`reasonLabel`) for the ones the audit log has to explain,
 *     which replaces the window.prompt() several screens used.
 *
 * The kit's ConfirmDialog was the first; it is an adapter onto this now.
 */

export type ConfirmTone = "danger" | "default";

export interface ConfirmDialogProps {
  /** Render nothing when false. Defaults to true, so `{x && <ConfirmDialog/>}` also works. */
  open?: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** The action is running: both buttons disabled, Escape and the backdrop ignored. */
  busy?: boolean;
  /** The exact text that must be typed before Confirm enables — the record's name, say. */
  requireText?: string;
  /** Show a reason box with this label; onConfirm then receives `{ reason }`. */
  reasonLabel?: string;
  /** Whether the reason must be non-empty. Defaults to true when reasonLabel is set. */
  reasonRequired?: boolean;
  reasonPlaceholder?: string;
  /** Called with the reason when a reason box is shown, without arguments otherwise. */
  onConfirm: (result: { reason: string }) => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open = true, ...props }: ConfirmDialogProps) {
  // The body is its own component so that what was typed into it — a name, a
  // reason — is dropped when the dialog closes, rather than waiting there for
  // the next time it opens on a different record.
  if (!open) return null;
  return <ConfirmDialogBody {...props} />;
}

function ConfirmDialogBody({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  requireText,
  reasonLabel,
  reasonRequired = true,
  reasonPlaceholder,
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, "open">) {
  const { t } = useI18n();
  const [typed, setTyped] = React.useState("");
  const [reason, setReason] = React.useState("");
  const ids = React.useId();

  const typedOk = !requireText || typed.trim() === requireText.trim();
  const reasonOk = !reasonLabel || !reasonRequired || reason.trim() !== "";
  const ready = typedOk && reasonOk && !busy;

  return (
    <Modal label={title} onClose={onCancel} dismissible={!busy} dirty={false}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onConfirm({ reason: reason.trim() });
        }}
      >
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle
            aria-hidden="true"
            className={`w-5 h-5 shrink-0 ${tone === "danger" ? "text-danger" : "text-warning"}`}
          />
          {title}
        </h2>
        {body && <div className="text-sm text-muted">{body}</div>}
        {reasonLabel && (
          <label className="block space-y-1.5" htmlFor={`${ids}-reason`}>
            <span className="text-sm font-medium text-foreground">{reasonLabel}</span>
            <textarea
              id={`${ids}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder}
              required={reasonRequired}
              rows={3}
              maxLength={500}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-surface"
            />
          </label>
        )}
        {requireText && (
          <label className="block space-y-1.5" htmlFor={`${ids}-typed`}>
            <span className="text-sm text-foreground">
              {t("base.confirm.type_to_confirm", { text: requireText })}
            </span>
            <input
              id={`${ids}-typed`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus={!reasonLabel}
              className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-surface font-mono"
            />
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 px-4 text-sm text-foreground border border-line rounded-lg hover:bg-surface-hover disabled:opacity-50"
          >
            {cancelLabel || t("base.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={!ready}
            aria-busy={busy || undefined}
            className={`min-h-11 px-4 text-sm rounded-lg font-semibold inline-flex items-center gap-2 disabled:opacity-50 ${
              tone === "danger"
                ? "bg-danger-solid text-white hover:brightness-110"
                : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── useConfirm ─────────────────────────────────────────────────────────────

export type ConfirmOptions = Omit<
  ConfirmDialogProps,
  "open" | "busy" | "onConfirm" | "onCancel" | "confirmLabel"
> & { confirmLabel?: string };

type Ask = (options: ConfirmOptions) => Promise<false | { reason: string }>;

const ConfirmContext = React.createContext<Ask | null>(null);

/**
 * Where useConfirm's dialogs are drawn. Mounted once, in app/providers.tsx.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = React.useState<
    { id: number; options: ConfirmOptions; resolve: (value: false | { reason: string }) => void } | null
  >(null);
  const asked = React.useRef(0);

  const ask = React.useCallback<Ask>(
    (options) =>
      new Promise((resolve) => {
        const id = ++asked.current;
        // A second question while one is open answers the first "no" rather
        // than leaving its promise hanging for ever.
        setPending((current) => {
          current?.resolve(false);
          return { id, options, resolve };
        });
      }),
    [],
  );

  const settle = (value: false | { reason: string }) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <ConfirmDialog
          // A fresh dialog per question, so a typed name or reason does not
          // carry over from the last one.
          key={pending.id}
          {...pending.options}
          confirmLabel={pending.options.confirmLabel || t("base.action.confirm")}
          onConfirm={(result) => settle(result)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * window.confirm and window.prompt, as the platform's own dialog.
 *
 *   const confirm = useConfirm();
 *
 *   if (!(await confirm({ title: t("x.confirm_delete"), confirmLabel: t("base.action.delete"), tone: "danger" }))) return;
 *
 *   const answer = await confirm({ title, reasonLabel: t("x.reason") });
 *   if (!answer) return;
 *   await api.suspend(id, answer.reason);
 *
 * Resolves `false` on cancel, and `{ reason }` (truthy, reason "" when no box
 * was asked for) on confirm — so `if (!(await confirm(…))) return` reads the
 * same as the window.confirm it replaces. Outside a ConfirmProvider (a test
 * that did not mount one) it falls back to window.confirm / window.prompt.
 */
export function useConfirm(): Ask {
  const ask = React.useContext(ConfirmContext);
  return React.useCallback<Ask>(
    async (options) => {
      if (ask) return ask(options);
      if (options.reasonLabel) {
        const reason = window.prompt(`${options.title}\n\n${options.reasonLabel}`);
        if (reason === null) return false;
        if ((options.reasonRequired ?? true) && !reason.trim()) return false;
        return { reason: reason.trim() };
      }
      return window.confirm(options.title) ? { reason: "" } : false;
    },
    [ask],
  );
}

// ─── One-time secrets ───────────────────────────────────────────────────────

/**
 * A value the server will never show again: a client secret, an API key, a
 * recovery code.
 *
 * Built so it cannot be lost by accident. Escape and the backdrop do nothing
 * (`dismissible={false}`), and Done stays disabled until the reader ticks "I
 * have stored this somewhere safe" — the dialog closing is the moment the
 * secret is gone for good, so it is the reader who decides when, deliberately.
 *
 *   <SecretRevealDialog
 *     title={t("sso_clients.message.secret_once_title")}
 *     body={t("sso_clients.message.secret_once_body")}
 *     items={[{ label: "client_id", value: id }, { label: "client_secret", value: secret, secret: true }]}
 *     onDone={() => setRevealed(null)}
 *   />
 */
export function SecretRevealDialog({
  title,
  body,
  items,
  doneLabel,
  onDone,
}: {
  title: string;
  /** Defaults to "This value will not be shown again…". */
  body?: React.ReactNode;
  /** `secret: true` marks the one-time value; it is drawn in the warning tone. */
  items: Array<{ label: string; value: string; secret?: boolean }>;
  doneLabel?: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [saved, setSaved] = React.useState(false);
  const ackId = React.useId();
  return (
    <Modal label={title} onClose={onDone} dismissible={false}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <KeyRound aria-hidden="true" className="w-5 h-5 text-warning" />
          {title}
        </h2>
        <p className="text-sm text-muted">{body ?? t("base.secret.once_note")}</p>
        {items.map((item) => (
          <SecretRow key={item.label} {...item} />
        ))}
        <label htmlFor={ackId} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input
            id={ackId}
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
            className="h-5 w-5 shrink-0"
          />
          {t("base.secret.saved_ack")}
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDone}
            disabled={!saved}
            className="min-h-11 px-4 text-sm bg-accent text-on-accent hover:bg-accent-hover rounded-lg font-semibold disabled:opacity-50"
          >
            {doneLabel || t("base.action.done")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SecretRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const text = React.useRef<HTMLElement>(null);
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        secret ? "bg-warning-soft border-warning-border" : "bg-surface-2 border-line"
      }`}
    >
      <span className="text-2xs font-semibold text-muted w-24 shrink-0 break-words">{label}</span>
      <code ref={text} className="text-xs font-mono text-foreground break-all flex-1 select-all">
        {value}
      </code>
      <CopyButton value={value} id={label} selectOnFail={text} />
    </div>
  );
}
