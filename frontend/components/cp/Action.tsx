"use client";

/**
 * How the console asks for the two things every dangerous action needs: a
 * reason, and — when the step-up window has closed — the authenticator code
 * again.
 *
 * One hook rather than a dialog per screen. Every write in this console has the
 * same shape (say why, do it, maybe prove yourself again), and a screen that
 * implemented it for itself would be the screen that forgot the retry, or
 * asked for a reason it then did not send.
 *
 *     const action = useAction();
 *     action.run({
 *       title: t("cp.action.suspend"),
 *       perform: (reason) => cp.suspend(tenant.id, reason),
 *       onDone: reload,
 *     });
 */

import React, { useCallback, useState } from "react";

import { cp, StepUpRequired } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";
import { Loader2 } from "lucide-react";
import { Banner, ErrorNote, Modal } from "@/components/ui";

interface Request {
  title: string;
  /** What the operator is about to do to what, in one line. */
  detail?: string;
  perform: (reason: string) => Promise<unknown>;
  onDone?: () => void;
  /** Destructive actions get the red button. */
  danger?: boolean;
  /**
   * Text the operator must type before Confirm enables — the tenant's slug,
   * say. For the actions that cannot be walked back, where a reason alone is
   * one reflexive sentence away from the wrong organisation.
   */
  confirmText?: string;
  /** Extra lines under the detail: what will happen, and when. */
  body?: React.ReactNode;
}

export function useAction() {
  const [request, setRequest] = useState<Request | null>(null);
  const run = useCallback((next: Request) => setRequest(next), []);
  const dialog = request ? (
    <ActionDialog request={request} onClose={() => setRequest(null)} />
  ) : null;
  return { run, dialog };
}

function ActionDialog({ request, onClose }: { request: Request; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  // The code field appears only once the server has asked for it, so an
  // operator inside the five-minute window is never shown a box they do not
  // need to fill in.
  const [needsCode, setNeedsCode] = useState(false);
  const [stepUpAsked, setStepUpAsked] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const typedOk = !request.confirmText || typed.trim() === request.confirmText;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !typedOk) return;
    setBusy(true);
    setFailure("");
    try {
      if (needsCode) {
        // Prove ourselves first, then do what was asked. The other order —
        // trying the action and stepping up on the refusal — would perform the
        // step-up as a side effect of a failure, and a failed action would
        // leave the window open behind it.
        await cp.stepUp(code);
      }
      await request.perform(reason);
      request.onDone?.();
      onClose();
    } catch (error) {
      if (error instanceof StepUpRequired) {
        setNeedsCode(true);
        setStepUpAsked(true);
        setFailure("");
        return;
      }
      setStepUpAsked(false);
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    // While the request is out the dialog stays put: closing it would not
    // stop the action, only hide whether it happened.
    <Modal onClose={busy ? undefined : onClose} label={request.title}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{request.title}</h2>
          {request.detail && <p className="mt-1 text-sm text-muted">{request.detail}</p>}
          {request.body && <div className="mt-2 text-sm text-foreground">{request.body}</div>}
        </div>

        {stepUpAsked && <Banner tone="warning" message={t("cp.message.step_up")} />}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        <label className="block text-sm">
          <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
            {t("cp.field.reason")}
          </span>
          <textarea
            required
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
          <span className="mt-1 block text-xs text-muted">{t("cp.hint.reason")}</span>
        </label>

        {request.confirmText && (
          <label className="block text-sm">
            <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
              {t("base.confirm.type_to_confirm", { text: request.confirmText })}
            </span>
            <input
              required
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-invalid={typed !== "" && !typedOk}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono"
            />
          </label>
        )}

        {needsCode && (
          <label className="block text-sm">
            <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
              {t("cp.field.code")}
            </span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono tracking-[0.4em]"
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-hover disabled:opacity-60"
          >
            {t("cp.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !typedOk}
            aria-busy={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              request.danger ? "bg-danger-solid text-white hover:brightness-110" : "bg-accent text-on-accent hover:brightness-105"
            }`}
          >
            {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
            {t("cp.action.confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
