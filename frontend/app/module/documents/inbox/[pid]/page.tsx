"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { contracts, InboxDetail } from "@/lib/contracts";
import { useResource, useLoadOnMount } from "@/lib/useResource";
import { useAccess } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Banner, LoadingBlock, Modal, cardClass, fieldClass } from "@/components/ui";
import { CeremonyButton, PartyBadge, PartyDot, fmtWhen } from "@/components/documents/contracts";
import { ArrowLeft, FileText } from "lucide-react";

/**
 * One incoming contract, as the recipient sees it: the frozen text, who else
 * is on the contract (names and states only — no contact details, that is the
 * issuer's view), the signatories this organisation has named, and the two
 * possible answers — a PIN2 signature or a reasoned refusal.
 */
export default function ContractInboxDetailPage() {
  const { pid } = useParams<{ pid: string }>();
  const { t } = useI18n();
  const { can } = useAccess();
  const mayNominate = can("documents.parties");
  const maySign = can("documents.sign");

  const detail = useResource<InboxDetail | null>(() => contracts.inboxShow(pid), { initial: null });
  useLoadOnMount(detail.reload);

  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [declining, setDeclining] = useState(false);

  // Only the first load blanks the page; a reload after signing keeps it.
  if (detail.loading && !detail.data) return <LoadingBlock />;
  if (!detail.data) return <Banner tone="error" message={t("contracts.msg.load_failed")} />;
  const item = detail.data;
  const open = item.state === "invited" || item.state === "viewed";
  const named = item.my_signatories.length > 0;

  return (
    <div className="space-y-6">
      <Link href="/module/documents/inbox" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" />
        {t("contracts.view.inbox_back")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{item.title}</h1>
        <PartyBadge state={item.state} />
      </div>

      {item.parties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.parties.map((party, index) => (
            <span key={index} className="inline-flex items-center gap-2 bg-surface border border-line rounded-full px-3 py-1 text-xs">
              <PartyDot state={party.state} />
              <span className="font-medium text-foreground">
                {party.display_name}{party.mine ? ` ${t("contracts.msg.you")}` : ""}
              </span>
              <PartyBadge state={party.state} />
            </span>
          ))}
        </div>
      )}

      {item.has_copy ? (
        <section className={`${cardClass} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.body")}</h2>
            <a href={contracts.inboxCopyUrl(pid)} target="_blank" rel="noopener noreferrer"
              className="min-h-9 text-xs font-semibold text-foreground bg-surface-2 hover:bg-surface-hover border border-line px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
              <FileText aria-hidden="true" className="w-3.5 h-3.5" />
              {t("contracts.action.view_pdf")}
            </a>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-surface-2 border border-line rounded-lg p-4 max-h-[28rem] overflow-auto">
            {item.body_text}
          </div>
          <p className="text-2xs text-muted font-mono break-all">{t("contracts.msg.sha", { sha: item.sha256 || "—" })}</p>
        </section>
      ) : (
        <Banner tone="warning" message={t("contracts.msg.not_delivered")} />
      )}

      <section className={`${cardClass} p-5 space-y-3`}>
        <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.signatory")}</h2>
        {named ? (
          item.my_signatories.map((signatory) => (
            <p key={signatory.id} className="text-sm text-foreground">
              {signatory.full_name}
              {signatory.position ? ` (${signatory.position})` : ""}
              {signatory.reg_number ? ` · ${signatory.reg_number}` : ""}
              {signatory.signed_at ? ` ✓ ${fmtWhen(signatory.signed_at)}` : ""}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted">{t("contracts.msg.no_signatory")}</p>
        )}
        {mayNominate && open && <NominateForm pid={pid} onAdded={detail.reload} />}
      </section>

      {open && item.has_copy && maySign && (
        <section className={`${cardClass} p-5 space-y-3`}>
          <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.decision")}</h2>
          {/* The outcome of signing, beside the button that started it. */}
          {message && <Banner tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} />}
          <div className="flex flex-wrap gap-2">
            <CeremonyButton
              label={t("contracts.action.sign")}
              start={() => contracts.inboxSignStart(pid)}
              poll={() => contracts.inboxSignPoll(pid)}
              onDone={async () => {
                setMessage({ tone: "success", text: t("contracts.msg.signed") });
                await detail.reload();
              }}
              onError={(value) => setMessage({ tone: "error", text: value })}
              className="min-h-11 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
            />
            <button type="button" onClick={() => setDeclining(true)}
              className="min-h-11 bg-danger-soft hover:brightness-95 border border-danger-border text-danger text-sm font-semibold px-4 py-2 rounded-lg">
              {t("contracts.action.decline")}
            </button>
          </div>
        </section>
      )}

      {/* Outside the decision section too: a sign that just completed moves
          the state on, and the decision section with its banner goes. */}
      {message && !(open && item.has_copy && maySign) && (
        <Banner tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} />
      )}

      {item.state === "signed" && (
        <section className={`${cardClass} p-5 space-y-3`}>
          <Banner tone="success" message={t("contracts.msg.signed_done")} />
          <a href={contracts.inboxSignedUrl(pid)} target="_blank" rel="noopener noreferrer"
            className="min-h-9 text-xs font-semibold text-success bg-success-soft border border-success-border hover:brightness-95 px-3 py-1.5 rounded-lg inline-flex items-center">
            {t("contracts.action.signed_pdf")}
          </a>
        </section>
      )}
      {item.state === "declined" && <Banner tone="error" message={t("contracts.msg.declined_done")} />}

      {declining && (
        <DeclineModal
          pid={pid}
          onClose={() => setDeclining(false)}
          onDeclined={async () => { setDeclining(false); await detail.reload(); }}
        />
      )}
    </div>
  );
}

function NominateForm({ pid, onAdded }: {
  pid: string;
  onAdded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const ids = React.useId();
  const [form, setForm] = useState({ full_name: "", position: "", reg_number: "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const nominate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim() || !form.reg_number.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await contracts.inboxNominate(pid, {
        full_name: form.full_name.trim(), position: form.position.trim(), reg_number: form.reg_number.trim(),
      });
      setForm({ full_name: "", position: "", reg_number: "" });
      await onAdded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Visible labels rather than placeholders: a placeholder vanishes on the
  // first keystroke, and three empty boxes in a row do not say which is which.
  const label = "block text-xs font-medium text-muted mb-1";
  return (
    <form onSubmit={nominate} className="border-t border-line pt-3 space-y-3">
      <p className="text-xs text-muted">{t("contracts.msg.nominate_hint")}</p>
      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${ids}-name`} className={label}>{t("contracts.field.full_name")} *</label>
          <input id={`${ids}-name`} required className={fieldClass} value={form.full_name} onChange={set("full_name")} />
        </div>
        <div>
          <label htmlFor={`${ids}-reg`} className={label}>{t("contracts.field.reg")} *</label>
          <input id={`${ids}-reg`} required className={fieldClass} value={form.reg_number} onChange={set("reg_number")} />
        </div>
        <div>
          <label htmlFor={`${ids}-position`} className={label}>{t("contracts.field.position")}</label>
          <input id={`${ids}-position`} className={fieldClass} value={form.position} onChange={set("position")} />
        </div>
      </div>
      <button type="submit" disabled={busy || !form.full_name.trim() || !form.reg_number.trim()} aria-busy={busy || undefined}
        className="min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 rounded-lg">
        {t("contracts.action.nominate")}
      </button>
    </form>
  );
}

function DeclineModal({ pid, onClose, onDeclined }: {
  pid: string;
  onClose: () => void;
  onDeclined: () => Promise<void>;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const reasonId = React.useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // In the dialog: the page behind is dimmed, and an error drawn there was
  // never seen.
  const [error, setError] = useState<string | null>(null);
  const decline = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await contracts.inboxDecline(pid, reason.trim());
      await onDeclined();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} label={t("contracts.action.decline")} dismissible={!busy}>
      <form onSubmit={decline} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("contracts.action.decline")}</h2>
        <p id={`${reasonId}-hint`} className="text-xs text-muted">{t("contracts.msg.decline_hint")}</p>
        {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
        <div>
          <label htmlFor={reasonId} className="block text-xs font-medium text-foreground mb-1">{t("contracts.field.reason")} *</label>
          <textarea
            id={reasonId}
            autoFocus
            required
            aria-describedby={`${reasonId}-hint`}
            className={`${fieldClass} min-h-[100px]`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 text-sm font-medium text-muted px-4 py-2 rounded-lg hover:bg-surface-hover">
            {t("contracts.action.cancel")}
          </button>
          <button type="submit" disabled={busy || !reason.trim()} aria-busy={busy || undefined}
            className="min-h-11 bg-danger-solid hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {t("contracts.action.decline")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
