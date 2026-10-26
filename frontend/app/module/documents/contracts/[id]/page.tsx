"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  contracts, CeremonySession, ContractRow, ContractShape, Invitation, Party,
} from "@/lib/contracts";
import { useResource, useLoadOnMount } from "@/lib/useResource";
import { useAccess } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import {
  Banner, CopyButton, FileDropzone, LoadingBlock, Modal, cardClass, fieldClass, selectClass,
  useConfirm, useUnsavedChanges,
} from "@/components/ui";
import {
  CeremonyButton, ContractBadge, PartyBadge, PartyDot, fmtWhen, useContractLabels,
} from "@/components/documents/contracts";
import { ArrowLeft, Check, Download, FileUp, Link2, Loader2, Plus, Send, Undo2 } from "lucide-react";

/**
 * One contract, everything the issuer does to it: the facts (number, amount,
 * term), the file and text, the parties with their signatories, issuing to
 * many, and the acts — send, sign for a party, create an invitation link,
 * withdraw, reopen.
 *
 * One load feeds the whole page: the parties answer carries the contract's
 * facts, so the screen cannot show a number the register disagrees with.
 *
 * The page used to be six cards in one column with a single message banner at
 * the top: an error from a button at the bottom of the page appeared a screen
 * away from it, and nothing said which of the six had been done. It is laid out
 * as the workflow now — details, file and text, parties, issue, send — as tabs
 * that show which steps are complete, and each step says its own outcome
 * beside the button that caused it. Every panel stays mounted while hidden, so
 * a half-typed party or unsaved text survives a look at another step.
 */

type Step = "facts" | "file" | "parties" | "issue" | "send";
type Note = { tone: "error" | "success" | "warning"; text: string } | null;

/** A labelled field whose label is tied to its control. */
function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted mb-1">{label}</label>
      {children(id)}
    </div>
  );
}

/** Where a step reports what its last action did — beside that action. */
function StepNote({ note, onDismiss }: { note: Note; onDismiss: () => void }) {
  if (!note) return null;
  return <Banner tone={note.tone} message={note.text} onDismiss={onDismiss} />;
}

const secondaryButton =
  "min-h-9 text-xs font-semibold text-foreground bg-surface border border-line hover:bg-surface-hover px-3 py-1.5 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5";
const primaryButton =
  "min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-sm font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5";

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const { can } = useAccess();
  const mayManage = can("documents.manage");
  const mayParties = can("documents.parties");
  const maySend = can("documents.send");
  const maySign = can("documents.sign");

  const shape = useResource<ContractShape | null>(() => contracts.parties(id), { initial: null });
  // The text as the server last held it, so the editor knows whether it has
  // unsaved changes.
  const [bodyBaseline, setBodyBaseline] = useState<string | null>(null);
  const text = useResource<string>(async () => {
    const body = (await contracts.body(id)).body ?? "";
    setBodyBaseline(body);
    return body;
  }, { initial: "" });
  useLoadOnMount(shape.reload);
  useLoadOnMount(text.reload);

  const [notes, setNotes] = useState<Record<Step | "pdf", Note>>({
    facts: null, file: null, pdf: null, parties: null, issue: null, send: null,
  });
  const noteFor = (step: Step | "pdf") => ({
    note: notes[step],
    dismiss: () => setNotes((current) => ({ ...current, [step]: null })),
    info: (value: string) => setNotes((current) => ({ ...current, [step]: { tone: "success", text: value } })),
    // A string is a sentence already in the reader's language (the ceremony
    // button translates its own outcomes); anything else is an error to explain.
    fail: (err: unknown) =>
      setNotes((current) => ({
        ...current,
        [step]: { tone: "error", text: typeof err === "string" ? err : errorMessage(err) },
      })),
  });

  const [tab, setTab] = useState<Step | null>(null);

  // Only the FIRST load replaces the page with a placeholder. A reload after
  // a save used to do the same, which unmounted every card and threw away
  // whatever the others were holding — an issue's skipped rows, a half-added
  // party.
  if (shape.loading && !shape.data) return <LoadingBlock />;
  if (!shape.data) return <Banner tone="error" message={t("contracts.msg.load_failed")} />;

  const contract = shape.data;
  const state = contract.contract_state;
  const editable = state === "DRAFT" || state === "NONE";
  const reload = async () => { await shape.reload(); };
  const counterparties = contract.parties.filter((party) => party.party_role !== "issuer");
  const hasFacts = !!(contract.contract_number || contract.amount != null || contract.effective_from);
  const hasContent = !!contract.attachment || (bodyBaseline ?? "").trim() !== "";
  const sent = !editable;

  const steps: Array<{ key: Step; label: string; done: boolean; show: boolean }> = [
    { key: "facts", label: t("contracts.step.facts"), done: hasFacts, show: true },
    { key: "file", label: t("contracts.step.file"), done: hasContent, show: true },
    { key: "parties", label: t("contracts.step.parties"), done: counterparties.length > 0, show: true },
    { key: "issue", label: t("contracts.step.issue"), done: false, show: maySend },
    { key: "send", label: t("contracts.step.send"), done: sent, show: maySend && counterparties.length > 0 },
  ];
  const visible = steps.filter((step) => step.show);
  const active: Step = tab && visible.some((step) => step.key === tab) ? tab : sent ? "parties" : "facts";
  const doneCount = visible.filter((step) => step.done).length;

  const facts = noteFor("facts");
  const pdf = noteFor("pdf");
  const body = noteFor("file");
  const parties = noteFor("parties");
  const issue = noteFor("issue");
  const send = noteFor("send");

  return (
    <div className="space-y-6">
      <Link href="/module/documents/contracts" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" />
        {t("contracts.view.back")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{contract.title}</h1>
        <ContractBadge state={state} />
        {shape.loading && <Loader2 aria-label={t("base.message.loading")} className="w-4 h-4 animate-spin text-muted" />}
      </div>

      {/* Талуудын явц — гэрээ хаана байгааг нэг харцаар. */}
      {contract.parties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {contract.parties.map((party) => (
            <span key={party.id} className="inline-flex items-center gap-2 bg-surface border border-line rounded-full px-3 py-1 text-xs">
              <PartyDot state={party.state} />
              <span className="font-medium text-foreground">{party.display_name}</span>
              <PartyBadge state={party.state} />
            </span>
          ))}
        </div>
      )}

      {/* The workflow as tabs, each saying whether it is done. */}
      <div className="space-y-2">
        <p className="text-xs text-muted" aria-live="polite">
          {t("contracts.step.progress", { done: doneCount, total: visible.length })}
        </p>
        <div role="tablist" aria-label={t("contracts.step.label")} className="flex gap-1 overflow-x-auto border-b border-line">
          {visible.map((step, index) => {
            const selected = step.key === active;
            return (
              <button
                key={step.key}
                id={`contract-tab-${step.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`contract-panel-${step.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(step.key)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  event.preventDefault();
                  const next = visible[(index + (event.key === "ArrowRight" ? 1 : visible.length - 1)) % visible.length];
                  setTab(next.key);
                  document.getElementById(`contract-tab-${next.key}`)?.focus();
                }}
                className={`shrink-0 min-h-11 px-3 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 ${
                  selected ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full text-2xs font-semibold inline-flex items-center justify-center border ${
                    step.done ? "bg-success-soft text-success border-success-border" : "bg-surface-2 text-muted border-line"
                  }`}
                >
                  {step.done ? <Check className="w-3 h-3" /> : index + 1}
                </span>
                {step.label}
                {step.done && <span className="sr-only">({t("contracts.step.done")})</span>}
              </button>
            );
          })}
        </div>
      </div>

      <TabPanel step="facts" active={active}>
        <StepNote note={facts.note} onDismiss={facts.dismiss} />
        <FactsCard
          // Remounted from the server's values after a save, so what the form
          // shows is what was stored — a trimmed number, an upper-cased code.
          key={[contract.contract_number, contract.amount, contract.currency, contract.effective_from, contract.effective_to, contract.due_at].join("|")}
          id={id}
          contract={contract}
          editable={mayManage && editable}
          onSaved={async () => {
            await reload();
            facts.info(t("contracts.msg.facts_saved"));
          }}
          onError={facts.fail}
        />
      </TabPanel>

      <TabPanel step="file" active={active}>
        <StepNote note={pdf.note} onDismiss={pdf.dismiss} />
        <MasterPdfCard
          id={id}
          contract={contract}
          mayManage={mayManage}
          maySign={maySign}
          onChanged={reload}
          onError={pdf.fail}
          onInfo={pdf.info}
        />
        <StepNote note={body.note} onDismiss={body.dismiss} />
        <BodyCard
          id={id}
          text={text.data}
          setText={text.setData}
          baseline={bodyBaseline}
          editable={mayManage}
          frozen={!editable}
          onSaved={(saved) => {
            setBodyBaseline(saved);
            body.info(t("contracts.msg.saved"));
          }}
          onError={body.fail}
        />
      </TabPanel>

      <TabPanel step="parties" active={active}>
        <StepNote note={parties.note} onDismiss={parties.dismiss} />
        <PartiesCard
          id={id}
          contract={contract}
          mayParties={mayParties}
          maySend={maySend}
          maySign={maySign}
          onChanged={reload}
          onError={parties.fail}
          onInfo={parties.info}
        />
      </TabPanel>

      {maySend && (
        <TabPanel step="issue" active={active}>
          <StepNote note={issue.note} onDismiss={issue.dismiss} />
          <IssueCard id={id} onChanged={reload} onError={issue.fail} onInfo={issue.info} />
        </TabPanel>
      )}

      {maySend && counterparties.length > 0 && (
        <TabPanel step="send" active={active}>
          <StepNote note={send.note} onDismiss={send.dismiss} />
          <SendCard id={id} state={state} mode={contract.mode} onChanged={reload} onError={send.fail} onInfo={send.info} />
        </TabPanel>
      )}
    </div>
  );
}

function TabPanel({ step, active, children }: { step: Step; active: Step; children: React.ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`contract-panel-${step}`}
      aria-labelledby={`contract-tab-${step}`}
      hidden={step !== active}
      className="space-y-4"
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── гэрээний мэдээлэл

function FactsCard({
  id, contract, editable, onSaved, onError,
}: {
  id: string;
  contract: ContractShape;
  editable: boolean;
  onSaved: () => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const { t } = useI18n();
  const day = (value?: string) => (value ? value.slice(0, 10) : "");
  const [initial] = useState(() => ({
    contract_number: contract.contract_number || "",
    amount: contract.amount != null ? String(contract.amount) : "",
    currency: contract.currency || "MNT",
    effective_from: day(contract.effective_from),
    effective_to: day(contract.effective_to),
    due_at: day(contract.due_at),
  }));
  const [facts, setFacts] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof facts) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFacts((current) => ({ ...current, [key]: event.target.value }));
  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some((key) => initial[key] !== facts[key]);
  useUnsavedChanges(editable && dirty);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await contracts.saveFacts(id, {
        contract_number: facts.contract_number.trim(),
        amount: facts.amount === "" ? null : Number(facts.amount),
        currency: facts.currency.trim().toUpperCase(),
        effective_from: facts.effective_from,
        effective_to: facts.effective_to,
        due_at: facts.due_at ? `${facts.due_at}T23:59:59Z` : "",
      });
      await onSaved();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className={`${cardClass} p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.facts")}</h2>
        {editable && (
          <span className="flex items-center gap-2">
            {dirty && <span className="text-xs text-warning">{t("contracts.msg.unsaved")}</span>}
            <button type="submit" disabled={busy || !dirty} aria-busy={busy || undefined}
              className="min-h-9 text-xs font-semibold text-accent bg-accent-soft hover:brightness-95 px-3 py-1.5 rounded-lg disabled:opacity-50">
              {t("contracts.action.save")}
            </button>
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label={t("contracts.field.number")}>{(fid) => <input id={fid} className={fieldClass} value={facts.contract_number} onChange={set("contract_number")} disabled={!editable} />}</Field>
        <Field label={t("contracts.field.due")}>{(fid) => <input id={fid} type="date" className={fieldClass} value={facts.due_at} onChange={set("due_at")} disabled={!editable} />}</Field>
        <Field label={t("contracts.field.amount")}>{(fid) => <input id={fid} type="number" step="0.01" className={fieldClass} value={facts.amount} onChange={set("amount")} disabled={!editable} />}</Field>
        <Field label={t("contracts.field.currency")}>{(fid) => <input id={fid} maxLength={3} className={fieldClass} value={facts.currency} onChange={set("currency")} disabled={!editable} />}</Field>
        <Field label={t("contracts.field.effective_from")}>{(fid) => <input id={fid} type="date" className={fieldClass} value={facts.effective_from} max={facts.effective_to || undefined} onChange={set("effective_from")} disabled={!editable} />}</Field>
        <Field label={t("contracts.field.effective_to")}>{(fid) => <input id={fid} type="date" className={fieldClass} value={facts.effective_to} min={facts.effective_from || undefined} onChange={set("effective_to")} disabled={!editable} />}</Field>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────── бичвэр

function BodyCard({
  id, text, setText, baseline, editable, frozen, onSaved, onError,
}: {
  id: string;
  text: string;
  setText: (value: string) => void;
  baseline: string | null;
  editable: boolean;
  frozen: boolean;
  onSaved: (saved: string) => void;
  onError: (err: unknown) => void;
}) {
  const { t } = useI18n();
  const ids = useId();
  const [busy, setBusy] = useState(false);
  const dirty = editable && !frozen && baseline !== null && text !== baseline;
  useUnsavedChanges(dirty);
  const save = async () => {
    setBusy(true);
    try {
      await contracts.saveBody(id, text);
      onSaved(text);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${cardClass} p-5 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          <label htmlFor={`${ids}-body`}>{t("contracts.section.body")}</label>
        </h2>
        {editable && !frozen && (
          <span className="flex items-center gap-2">
            {dirty && <span className="text-xs text-warning">{t("contracts.msg.unsaved")}</span>}
            <button type="button" onClick={() => void save()} disabled={busy || !dirty} aria-busy={busy || undefined}
              className="min-h-9 text-xs font-semibold text-accent bg-accent-soft hover:brightness-95 px-3 py-1.5 rounded-lg disabled:opacity-50">
              {t("contracts.action.save")}
            </button>
          </span>
        )}
      </div>
      {frozen && <Banner tone="info" message={t("contracts.body.frozen_note")} />}
      <textarea
        id={`${ids}-body`}
        aria-describedby={`${ids}-hint`}
        className={`${fieldClass} min-h-[260px] font-mono text-sm leading-relaxed`}
        placeholder={t("contracts.body.placeholder")}
        value={text}
        onChange={(event) => setText(event.target.value)}
        readOnly={frozen || !editable}
      />
      <p id={`${ids}-hint`} className="text-2xs text-muted">{t("contracts.body.hint")}</p>
      <details className="text-2xs text-muted">
        <summary className="cursor-pointer hover:text-foreground">{t("contracts.body.tokens_summary")}</summary>
        {t("contracts.body.advanced", { tokens: "{{тал}} {{регистр}} {{төлөөлөгч}} {{хаяг}} {{гэрээ}} {{дугаар}} {{огноо}}" })}
      </details>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────── талууд

function PartiesCard({
  id, contract, mayParties, maySend, maySign, onChanged, onError, onInfo,
}: {
  id: string;
  contract: ContractShape;
  mayParties: boolean;
  maySend: boolean;
  maySign: boolean;
  onChanged: () => Promise<void>;
  onError: (err: unknown) => void;
  onInfo: (value: string) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [invite, setInvite] = useState<{ party: Party; invitation: Invitation } | null>(null);
  const [signatoryFor, setSignatoryFor] = useState<Party | null>(null);
  const draft = contract.contract_state === "DRAFT" || contract.contract_state === "NONE";

  return (
    <section className={`${cardClass} p-5 space-y-4`}>
      <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.parties")}</h2>
      <p className="text-xs text-muted">{t("contracts.parties.note")}</p>
      {contract.parties.length === 0 && <p className="text-sm text-muted">{t("contracts.msg.no_parties")}</p>}

      {contract.parties.map((party) => (
        <PartyRow
          key={party.id}
          id={id}
          party={party}
          draft={draft}
          mayParties={mayParties}
          maySend={maySend}
          maySign={maySign}
          onError={onError}
          onAddSignatory={() => setSignatoryFor(party)}
          onRemove={async () => {
            const ok = await confirm({
              title: t("contracts.confirm.remove_party_title"),
              body: t("contracts.confirm.remove_party_body", { name: party.display_name }),
              confirmLabel: t("contracts.action.remove"),
              tone: "danger",
            });
            if (!ok) return;
            try {
              await contracts.removeParty(id, party.id);
              await onChanged();
            } catch (err) {
              onError(err);
            }
          }}
          onInvite={async () => {
            try {
              setInvite({ party, invitation: await contracts.invite(id, party.id) });
            } catch (err) {
              onError(err);
            }
          }}
          onSigned={() => {
            onInfo(t("contracts.msg.signed"));
            void onChanged();
          }}
        />
      ))}

      {mayParties && <AddPartyForm id={id} onAdded={onChanged} onError={onError} />}

      {signatoryFor && (
        <SignatoryModal
          id={id}
          party={signatoryFor}
          onClose={() => setSignatoryFor(null)}
          onAdded={async () => { setSignatoryFor(null); await onChanged(); }}
        />
      )}
      {invite && (
        <InviteModal party={invite.party} invitation={invite.invitation} onClose={() => setInvite(null)} />
      )}
    </section>
  );
}

function PartyRow({
  id, party, draft, mayParties, maySend, maySign, onError, onAddSignatory, onRemove, onInvite, onSigned,
}: {
  id: string;
  party: Party;
  draft: boolean;
  mayParties: boolean;
  maySend: boolean;
  maySign: boolean;
  onError: (err: unknown) => void;
  onAddSignatory: () => void;
  onRemove: () => Promise<void>;
  onInvite: () => Promise<void>;
  onSigned: () => void;
}) {
  const { t } = useI18n();
  const { partyRole, partyKind } = useContractLabels();
  const [inviting, setInviting] = useState(false);
  const open = party.state === "invited" || party.state === "viewed";
  const contact = [party.registration_number, party.contact_email, party.contact_phone].filter(Boolean).join(" · ");
  const chip = "text-2xs bg-surface-2 border border-line text-muted rounded-full px-2 py-0.5";

  return (
    <div className="border border-line rounded-xl p-4 bg-surface-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{party.display_name}</span>
        <span className={chip}>{partyRole(party.party_role)}</span>
        <span className={chip}>{partyKind(party.party_kind)}</span>
        {party.sign_order != null && (
          <span className={chip}>{t("contracts.msg.signs_at", { n: party.sign_order })}</span>
        )}
        <span className="ml-auto"><PartyBadge state={party.state} /></span>
      </div>
      {contact && <div className="text-xs text-muted">{contact}</div>}
      {party.decline_reason && (
        <Banner tone="error" message={t("contracts.msg.decline_reason_of", { reason: party.decline_reason })} />
      )}
      {(party.signatories?.length ?? 0) > 0 && (
        <div className="text-xs text-muted">
          {party.signatories!.map((signatory) => (
            <span key={signatory.id} className="mr-3">
              {signatory.full_name}
              {signatory.position ? ` (${signatory.position})` : ""}
              {signatory.reg_number ? ` · ${signatory.reg_number}` : ""}
              {signatory.signed_at ? ` ✓ ${fmtWhen(signatory.signed_at)}` : ""}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {mayParties && party.party_role !== "issuer" && !party.counterparty_tenant_id && (
          <button type="button" onClick={onAddSignatory} className={secondaryButton}>
            {t("contracts.action.add_signatory")}
          </button>
        )}
        {party.has_copy && (
          <a href={contracts.copyUrl(id, party.id)} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            {t("contracts.action.frozen_pdf")}
          </a>
        )}
        {party.has_signed_copy && (
          <a href={contracts.signedUrl(id, party.id)} target="_blank" rel="noopener noreferrer"
            className="min-h-9 inline-flex items-center text-xs font-semibold text-success bg-success-soft border border-success-border hover:brightness-95 px-3 py-1.5 rounded-lg">
            {t("contracts.action.signed_pdf")}
          </a>
        )}
        {maySign && party.party_role !== "issuer" && open && (
          <CeremonyButton
            label={t("contracts.action.sign_for_party")}
            start={() => contracts.signStart(id, party.id)}
            poll={() => contracts.signPoll(id, party.id)}
            onDone={onSigned}
            onError={(value) => onError(value)}
          />
        )}
        {maySend && party.party_role !== "issuer" && open && (
          <button
            type="button"
            disabled={inviting}
            aria-busy={inviting || undefined}
            onClick={async () => {
              setInviting(true);
              await onInvite();
              setInviting(false);
            }}
            className={secondaryButton}
          >
            <Link2 aria-hidden="true" className="w-3.5 h-3.5" />
            {t("contracts.action.invite")}
          </button>
        )}
        {mayParties && draft && party.state === "draft" && (
          <button
            type="button"
            onClick={() => void onRemove()}
            className="min-h-9 text-xs font-semibold text-danger bg-surface border border-danger-border hover:bg-danger-soft px-3 py-1.5 rounded-lg"
          >
            {t("contracts.action.remove")}
          </button>
        )}
      </div>
    </div>
  );
}

const EMPTY_PARTY = {
  display_name: "", registration_number: "", party_role: "counterparty", party_kind: "organisation",
  contact_email: "", contact_phone: "", address_line: "", sign_order: "", home: "",
};

function AddPartyForm({ id, onAdded, onError }: {
  id: string;
  onAdded: () => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(EMPTY_PARTY);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const needsHome = form.party_kind === "tenant" || form.party_kind === "member";
  useUnsavedChanges(form.display_name.trim() !== "" || form.registration_number.trim() !== "");

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.display_name.trim()) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        party_role: form.party_role, party_kind: form.party_kind,
        display_name: form.display_name.trim(), registration_number: form.registration_number.trim(),
        contact_email: form.contact_email.trim(), contact_phone: form.contact_phone.trim(),
        address_line: form.address_line.trim(),
      };
      if (form.sign_order) payload.sign_order = Number(form.sign_order);
      if (form.party_kind === "tenant") payload.counterparty_tenant_id = form.home.trim() || null;
      if (form.party_kind === "member") payload.member_user_id = form.home.trim() || null;
      await contracts.addParty(id, payload);
      setForm(EMPTY_PARTY);
      await onAdded();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={add} className="border-t border-line pt-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("contracts.section.add_party")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label={`${t("contracts.field.name")} *`}>{(fid) => <input id={fid} required className={fieldClass} value={form.display_name} onChange={set("display_name")} />}</Field>
        <Field label={t("contracts.field.reg")}>{(fid) => <input id={fid} className={fieldClass} value={form.registration_number} onChange={set("registration_number")} />}</Field>
        <Field label={t("contracts.field.role")}>{(fid) => (
          <select id={fid} className={selectClass} value={form.party_role} onChange={set("party_role")}>
            <option value="counterparty">{t("contracts.role.counterparty")}</option>
            <option value="issuer">{t("contracts.role.issuer")}</option>
            <option value="witness">{t("contracts.role.witness")}</option>
            <option value="guarantor">{t("contracts.role.guarantor")}</option>
          </select>
        )}</Field>
        <Field label={t("contracts.field.kind")}>{(fid) => (
          <select id={fid} className={selectClass} value={form.party_kind} onChange={set("party_kind")}>
            <option value="organisation">{t("contracts.kind.organisation")}</option>
            <option value="person">{t("contracts.kind.person")}</option>
            <option value="tenant">{t("contracts.kind.tenant")}</option>
            <option value="member">{t("contracts.kind.member")}</option>
          </select>
        )}</Field>
        <Field label={t("contracts.field.email")}>{(fid) => <input id={fid} type="email" className={fieldClass} value={form.contact_email} onChange={set("contact_email")} />}</Field>
        <Field label={t("contracts.field.phone")}>{(fid) => <input id={fid} type="tel" className={fieldClass} value={form.contact_phone} onChange={set("contact_phone")} />}</Field>
        <Field label={t("contracts.field.address")}>{(fid) => <input id={fid} className={fieldClass} value={form.address_line} onChange={set("address_line")} />}</Field>
        <Field label={t("contracts.field.sign_order")}>{(fid) => <input id={fid} type="number" min={1} className={fieldClass} value={form.sign_order} onChange={set("sign_order")} />}</Field>
        {needsHome && (
          <Field label={form.party_kind === "member" ? t("contracts.field.home_user") : t("contracts.field.home_tenant")}>
            {(fid) => <input id={fid} className={fieldClass} placeholder="UUID" value={form.home} onChange={set("home")} />}
          </Field>
        )}
      </div>
      {needsHome && <p className="text-2xs text-muted">{t("contracts.field.home_tenant_hint")}</p>}
      <p className="text-2xs text-muted">{t("contracts.field.sign_order_hint")}</p>
      <button type="submit" disabled={busy || !form.display_name.trim()} aria-busy={busy || undefined}
        className="min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5">
        <Plus aria-hidden="true" className="w-3.5 h-3.5" />
        {t("contracts.action.add")}
      </button>
    </form>
  );
}

function SignatoryModal({ id, party, onClose, onAdded }: {
  id: string;
  party: Party;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [form, setForm] = useState({ full_name: "", position: "", reg_number: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await contracts.addSignatory(id, party.id, {
        full_name: form.full_name.trim(), position: form.position.trim(), reg_number: form.reg_number.trim(),
      });
      await onAdded();
    } catch (err) {
      // In the dialog, where the reader is looking — not behind it.
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label={t("contracts.action.add_signatory")} dismissible={!busy}>
      <form onSubmit={add} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{party.display_name} — {t("contracts.section.signatory")}</h2>
        <p className="text-xs text-muted">{t("contracts.msg.nominate_hint")}</p>
        {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
        <Field label={`${t("contracts.field.full_name")} *`}>{(fid) => <input id={fid} autoFocus required className={fieldClass} value={form.full_name} onChange={set("full_name")} />}</Field>
        <Field label={t("contracts.field.position")}>{(fid) => <input id={fid} className={fieldClass} value={form.position} onChange={set("position")} />}</Field>
        <Field label={t("contracts.field.reg")}>{(fid) => <input id={fid} className={fieldClass} value={form.reg_number} onChange={set("reg_number")} />}</Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 text-sm font-medium text-muted px-4 py-2 rounded-lg hover:bg-surface-hover">
            {t("contracts.action.cancel")}
          </button>
          <button type="submit" disabled={busy || !form.full_name.trim()} aria-busy={busy || undefined} className={primaryButton}>
            {t("contracts.action.add")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * A one-time link: the server will not show it again, so the dialog does not
 * close on Escape or a stray click, and Done waits until the link has been
 * copied (or the reader says they have kept it).
 */
function InviteModal({ party, invitation, onClose }: {
  party: Party;
  invitation: Invitation;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const linkRef = React.useRef<HTMLElement>(null);
  const [kept, setKept] = useState(false);
  const ackId = useId();
  const url = typeof window !== "undefined" ? `${window.location.origin}${invitation.path}` : invitation.path;
  return (
    <Modal onClose={onClose} label={t("contracts.action.invite")} dismissible={false}>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("contracts.action.invite")}</h2>
        <p className="text-sm text-muted">{t("contracts.msg.invite_for", { name: party.display_name })}</p>
        <div className="flex items-center gap-3 bg-surface-2 rounded-lg p-3">
          <code ref={linkRef} className="font-mono text-xs break-all flex-1 select-all text-foreground">{url}</code>
          <CopyButton value={url} selectOnFail={linkRef} label={t("contracts.action.copy_link")} />
        </div>
        <Banner tone="warning" message={t("contracts.msg.invite_once")} />
        <p className="text-xs text-muted">{t("contracts.msg.invite_expires", { when: fmtWhen(invitation.expires_at) })}</p>
        <label htmlFor={ackId} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input id={ackId} type="checkbox" checked={kept} onChange={(event) => setKept(event.target.checked)} className="h-5 w-5 shrink-0" />
          {t("base.secret.saved_ack")}
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={!kept} className={primaryButton}>
            {t("base.action.done")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────── илгээх

function SendCard({ id, state, mode, onChanged, onError, onInfo }: {
  id: string;
  state: ContractShape["contract_state"];
  mode: string;
  onChanged: () => Promise<void>;
  onError: (err: unknown) => void;
  onInfo: (value: string) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const modeId = useId();
  const [signingMode, setSigningMode] = useState<"counterpart" | "joint">(mode === "joint" ? "joint" : "counterpart");
  const [busy, setBusy] = useState(false);
  const [skips, setSkips] = useState<Array<{ name: string; reason: string }>>([]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    // A reason, asked properly: window.prompt's Cancel used to return null,
    // which became "" and withdrew the contract anyway.
    const answer = await confirm({
      title: t("contracts.confirm.withdraw_title"),
      body: t("contracts.confirm.withdraw_body"),
      reasonLabel: t("contracts.field.reason"),
      confirmLabel: t("contracts.action.withdraw"),
      tone: "danger",
    });
    if (!answer) return;
    await act(() => contracts.withdraw(id, answer.reason));
  };

  return (
    <section className={`${cardClass} p-5 space-y-3`}>
      <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.send")}</h2>
      <p className="text-xs text-muted">{t("contracts.send.note")}</p>
      {state === "WITHDRAWN" && <Banner tone="warning" message={t("contracts.send.withdrawn_note")} />}
      <div className="max-w-xs">
        <label htmlFor={modeId} className="block text-xs font-medium text-muted mb-1">{t("contracts.field.mode")}</label>
        <select id={modeId} className={selectClass} value={signingMode} onChange={(event) => setSigningMode(event.target.value as "counterpart" | "joint")}>
          <option value="counterpart">{t("contracts.mode.counterpart")}</option>
          <option value="joint">{t("contracts.mode.joint")}</option>
        </select>
      </div>
      {skips.length > 0 && (
        <div role="status" className="rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning space-y-1">
          <p className="font-semibold">{t("contracts.send.skipped_title", { count: skips.length })}</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {skips.map((skip, index) => (
              <li key={index}>{skip.name}: {skip.reason}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {state !== "WITHDRAWN" && (
          <button
            type="button"
            onClick={() => void act(async () => {
              const result = await contracts.send(id, signingMode);
              setSkips(result.skipped.map((skip) => ({ name: skip.name, reason: skip.reason })));
              onInfo(t("contracts.msg.sent", { count: result.sent }));
            })}
            disabled={busy}
            aria-busy={busy || undefined}
            className={primaryButton}
          >
            {busy ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Send aria-hidden="true" className="w-4 h-4" />}
            {state === "DRAFT" || state === "NONE" ? t("contracts.action.send") : t("contracts.action.resend")}
          </button>
        )}
        {(state === "SENT" || state === "PARTIALLY_SIGNED" || state === "DECLINED") && (
          <button
            type="button"
            onClick={() => void withdraw()}
            disabled={busy}
            className="min-h-11 bg-danger-soft hover:brightness-95 border border-danger-border disabled:opacity-50 text-danger text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {t("contracts.action.withdraw")}
          </button>
        )}
        {state === "WITHDRAWN" && (
          <button
            type="button"
            onClick={() => void act(() => contracts.reopen(id))}
            disabled={busy}
            className="min-h-11 bg-surface-2 hover:bg-surface-hover border border-line disabled:opacity-50 text-foreground text-sm font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
          >
            <Undo2 aria-hidden="true" className="w-4 h-4" />
            {t("contracts.action.reopen")}
          </button>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────── мастер PDF

/**
 * The largest contract file the screen accepts. The master is signed through
 * eID Mongolia, whose ceremony refuses a PDF over 25 MB (kernel/eidsign), so a
 * larger one could be attached and then never signed.
 */
const MAX_CONTRACT_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Гэрээний PDF: гаргагч өөрийн бэлтгэсэн файлаа хавсаргаж, ӨӨРӨӨ PIN2-оор
 * зурна. Илгээх агшинд тал бүрийн хөлдсөн хувь нь энэ файл — гаргагч зурсан
 * бол ГАРЫН ҮСЭГТЭЙ хувь нь — болно: захирал бүрийн зурах байт гаргагчийн
 * гарын үсгийг хамарна.
 *
 * Дараалал нь чухал бөгөөд сервер өөрөө барьдаг: гарын үсэг зурагдмагц файл
 * ч, талууд ч, бичвэр ч өөрчлөгдөхгүй. Тиймээс UI зөв дарааллыг хэлж өгнө:
 * PDF → талууд → өөрийн гарын үсэг → илгээх.
 */
function MasterPdfCard({ id, contract, mayManage, maySign, onChanged, onError, onInfo }: {
  id: string;
  contract: ContractShape;
  mayManage: boolean;
  maySign: boolean;
  onChanged: () => Promise<void>;
  onError: (err: unknown) => void;
  onInfo: (value: string) => void;
}) {
  const { t } = useI18n();
  const regId = useId();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [reg, setReg] = useState("");
  const attachment = contract.attachment ?? null;

  // Гаргагчийн өөрийн eID регистр — PIN2 яг түүний утсанд очно.
  React.useEffect(() => {
    let alive = true;
    contracts.myEidReg().then((value) => { if (alive && value) setReg(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setUploading(file);
    try {
      await contracts.attach(id, file);
      onInfo(t("contracts.msg.pdf_attached"));
      setReplacing(false);
      await onChanged();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setUploading(null);
    }
  };

  const showDropzone = mayManage && (!attachment || replacing);

  return (
    <section className={`${cardClass} p-5 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("contracts.section.pdf")}</h2>
        {mayManage && attachment && !replacing && (
          <button type="button" onClick={() => setReplacing(true)} disabled={busy} className={secondaryButton}>
            {t("contracts.action.replace_pdf")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t("contracts.pdf.note")}</p>
      <a href={contracts.wordTemplateUrl()} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
        <Download aria-hidden="true" className="w-3.5 h-3.5" />
        {t("contracts.action.word_template")}
      </a>
      {showDropzone && (
        <div className="space-y-2">
          <FileDropzone
            label={attachment ? t("contracts.action.replace_pdf") : t("contracts.action.attach_pdf")}
            accept=".pdf,.docx"
            maxBytes={MAX_CONTRACT_FILE_BYTES}
            file={uploading}
            disabled={busy}
            onFile={(file) => void upload(file)}
          />
          {busy && (
            <p role="status" className="text-xs text-muted inline-flex items-center gap-1.5">
              <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
              {t("contracts.msg.uploading")}
            </p>
          )}
          {replacing && (
            <button type="button" onClick={() => setReplacing(false)} disabled={busy} className="text-xs text-muted hover:text-foreground underline">
              {t("contracts.action.cancel")}
            </button>
          )}
        </div>
      )}
      {attachment ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <FileUp aria-hidden="true" className="w-4 h-4 text-muted" />
          <a href={contracts.fileUrl(id)} target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-accent hover:underline">
            {attachment.file_name}
          </a>
          <span className="text-xs text-muted">{(attachment.size_bytes / (1024 * 1024)).toFixed(1)} MB</span>
          {attachment.file_name.toLowerCase().endsWith(".docx") ? (
            <span className="text-xs font-semibold text-accent bg-accent-soft rounded-full px-2.5 py-0.5">
              {t("contracts.pdf.word_badge")}
            </span>
          ) : attachment.master_signed ? (
            <span className="text-xs font-semibold text-success bg-success-soft rounded-full px-2.5 py-0.5">
              {t("contracts.pdf.master_signed")}
            </span>
          ) : maySign ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <label htmlFor={regId} className="sr-only">{t("contracts.field.reg")}</label>
              <input
                id={regId}
                className={`${fieldClass} !w-44`}
                placeholder={t("contracts.field.reg")}
                value={reg}
                onChange={(event) => setReg(event.target.value)}
              />
              <CeremonyButton
                label={t("contracts.action.master_sign")}
                disabled={!reg.trim()}
                start={() => contracts.masterSignStart(id, reg.trim())}
                poll={(session: CeremonySession) => contracts.masterSignPoll(id, session.session_id)}
                onDone={async () => {
                  onInfo(t("contracts.msg.master_signed"));
                  await onChanged();
                }}
                onError={(value) => onError(value)}
              />
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">{t("contracts.pdf.none")}</p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────── тараалт

type Recipient = { name: string; org_reg?: string; signer_name?: string; signer_reg: string; position?: string };
type PreviewRow = Recipient & { line?: number; already_issued?: boolean; problem?: string };
type Skip = { row?: number; name?: string; reason: string };

/** The skipped rows as a CSV the operator can fix and re-import. */
function downloadSkipsCsv(skips: Skip[], header: [string, string, string]) {
  const cell = (value: string | number | undefined) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(cell).join(","), ...skips.map((skip) => [skip.row, skip.name, skip.reason].map(cell).join(","))];
  // The BOM makes Excel read the Cyrillic as UTF-8 rather than as Windows-1251.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "skipped.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Нэг загвар — хүн бүрд ТУСДАА гэрээ.
 *
 * Зээлийн гэрээг 500 хүнтэй байгуулахад 500 хүн НЭГ гэрээний хамтрагч тал
 * болдоггүй: хүн бүртэй тус тусдаа гэрээ байгуулагдана. Хүлээн авагчид
 * бие биеэ огт харахгүй, хүн бүрийн гэрээ өөрийнхөө гарын үсгээр хүчин
 * төгөлдөр болно. Жагсаалтыг Excel-ээс эсвэл энд нэг нэгээр нь нэмнэ.
 *
 * An Excel file is read first and shown — how many rows, which ones cannot be
 * used and why — and nothing is created until "Create N contracts" is
 * pressed. It used to create them the moment the file was chosen.
 */
function IssueCard({ id, onChanged, onError, onInfo }: {
  id: string;
  onChanged: () => Promise<void>;
  onError: (err: unknown) => void;
  onInfo: (value: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const nameId = useId();
  const regId = useId();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pending, setPending] = useState<Array<{ name: string; signer_reg: string }>>([]);
  const [preview, setPreview] = useState<{ file: File; rows: PreviewRow[] } | null>(null);
  const [name, setName] = useState("");
  const [reg, setReg] = useState("");
  const [outcome, setOutcome] = useState<{ issued: number; skipped: Skip[] } | null>(null);
  useUnsavedChanges(pending.length > 0 || preview !== null || progress !== null);

  const finish = async (result: { issued: number; children: unknown[]; skipped: Skip[] }) => {
    setOutcome({ issued: result.issued, skipped: result.skipped });
    setPending([]);
    setPreview(null);
    if (result.issued > 0) onInfo(t("contracts.issue.done", { count: result.issued }));
    await onChanged();
    router.refresh();
  };

  // Жагсаалт хэдий ч урт байг — 10-аар хэсэглэн ДАРААЛАН явуулна.
  // Word мастертай тараалтад хүн бүр LibreOffice хөрвүүлэлт «үнэтэй» тул
  // серверийн нэг хүсэлтийн дээд хязгаарт багтаж, явц нь чухам харагдана.
  const runChunked = async (rows: Recipient[]) => {
    setProgress({ done: 0, total: rows.length });
    try {
      await finish(await contracts.issueChunked(id, rows, (done, total) => setProgress({ done, total })));
    } finally {
      setProgress(null);
    }
  };

  const readFile = async (file: File) => {
    setBusy(true);
    setOutcome(null);
    try {
      // Excel нэг удаа урьдчилан уншигдана — юу ч үүсгэхгүй.
      const result = await contracts.issuePreview(id, file);
      setPreview({ file, rows: result.recipients });
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const usable = preview ? preview.rows.filter((row) => !row.problem && !row.already_issued) : [];
  const unusable = preview ? preview.rows.filter((row) => row.problem || row.already_issued) : [];

  const runPreview = async () => {
    if (!usable.length) return;
    setBusy(true);
    setOutcome(null);
    try {
      await runChunked(usable.map((row) => ({
        name: row.name, org_reg: row.org_reg, signer_name: row.signer_name,
        signer_reg: row.signer_reg, position: row.position,
      })));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const runManual = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      await runChunked(pending.map((row) => ({ name: row.name, signer_reg: row.signer_reg })));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className={`${cardClass} p-5 space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground grow">{t("contracts.section.issue")}</h2>
        <a href={contracts.importTemplateUrl()} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          <Download aria-hidden="true" className="w-3.5 h-3.5" />
          {t("contracts.action.import_template")}
        </a>
      </div>
      <p className="text-xs text-muted">{t("contracts.issue.note")}</p>

      {!preview && !progress && (
        <FileDropzone
          label={t("contracts.action.import_excel")}
          accept=".xlsx,.csv"
          disabled={busy}
          hint={t("contracts.issue.preview_hint")}
          onFile={(file) => void readFile(file)}
        />
      )}

      {preview && !progress && (
        <div className="rounded-xl border border-line p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground grow">
              {t("contracts.issue.preview_title", { file: preview.file.name })}
            </h3>
            <span className="text-xs text-muted">
              {t("contracts.issue.preview_counts", { total: preview.rows.length, ok: usable.length, bad: unusable.length })}
            </span>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <caption className="sr-only">{t("contracts.issue.preview_title", { file: preview.file.name })}</caption>
              <thead className="bg-surface-2 text-muted sticky top-0">
                <tr>
                  <th scope="col" className="text-left font-medium px-3 py-2">#</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">{t("contracts.field.recipient_name")}</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">{t("contracts.field.recipient_reg")}</th>
                  <th scope="col" className="text-left font-medium px-3 py-2">{t("base.field.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((row, index) => {
                  const bad = row.problem || row.already_issued;
                  return (
                    <tr key={index} className={bad ? "bg-danger-soft" : ""}>
                      <td className="px-3 py-1.5 text-muted font-mono">{row.line ?? index + 1}</td>
                      <td className="px-3 py-1.5 text-foreground">{row.name}</td>
                      <td className="px-3 py-1.5 text-foreground font-mono">{row.signer_reg}</td>
                      <td className={`px-3 py-1.5 ${bad ? "text-danger" : "text-success"}`}>
                        {row.problem
                          ? row.problem
                          : row.already_issued
                            ? t("contracts.issue.already_issued")
                            : t("contracts.issue.row_ok")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runPreview()} disabled={busy || usable.length === 0} className={primaryButton}>
              <Send aria-hidden="true" className="w-4 h-4" />
              {t("contracts.issue.create_n", { count: usable.length })}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={busy} className="min-h-11 px-4 text-sm text-foreground border border-line rounded-lg hover:bg-surface-hover">
              {t("contracts.action.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Гараар: нэр + регистр, хэдийг ч. */}
      {!preview && !progress && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !reg.trim()) return;
            setPending((current) => [...current, { name: name.trim(), signer_reg: reg.trim() }]);
            setName("");
            setReg("");
          }}
        >
          <div className="grow min-w-[12rem]">
            <label htmlFor={nameId} className="block text-xs font-medium text-muted mb-1">{t("contracts.field.recipient_name")}</label>
            <input id={nameId} className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="min-w-[11rem]">
            <label htmlFor={regId} className="block text-xs font-medium text-muted mb-1">{t("contracts.field.recipient_reg")}</label>
            <input id={regId} className={fieldClass} value={reg} onChange={(event) => setReg(event.target.value)} />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || !reg.trim()}
            className="h-[38px] text-xs font-semibold text-foreground bg-surface border border-line hover:bg-surface-hover px-3 rounded-lg disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Plus aria-hidden="true" className="w-3.5 h-3.5" />
            {t("contracts.action.add")}
          </button>
        </form>
      )}
      {pending.length > 0 && !progress && (
        <div className="space-y-1">
          {pending.map((row, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-foreground">
              <span className="grow">{row.name} · {row.signer_reg}</span>
              <button
                type="button"
                onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                className="min-h-9 text-xs text-danger hover:underline"
              >
                {t("contracts.action.remove")}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => void runManual()} disabled={busy} className={`mt-1 ${primaryButton}`}>
            <Send aria-hidden="true" className="w-4 h-4" />
            {t("contracts.action.issue", { count: pending.length })}
          </button>
        </div>
      )}

      {progress && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label={t("contracts.issue.progress", { done: progress.done, total: progress.total })}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs font-medium text-foreground" aria-live="polite">
            {t("contracts.issue.progress", { done: progress.done, total: progress.total })} · {percent}%
          </p>
        </div>
      )}
      {outcome && (
        <Banner
          tone={outcome.skipped.length ? "warning" : "success"}
          message={t("contracts.import.result", { added: outcome.issued, skipped: outcome.skipped.length })}
          onDismiss={() => setOutcome(null)}
        />
      )}
      {outcome && outcome.skipped.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted grow">
              {t("contracts.issue.skipped_title", { count: outcome.skipped.length })}
            </h3>
            <button
              type="button"
              onClick={() => downloadSkipsCsv(outcome.skipped, [t("contracts.issue.csv_row"), t("contracts.field.recipient_name"), t("contracts.field.reason")])}
              className={secondaryButton}
            >
              <Download aria-hidden="true" className="w-3.5 h-3.5" />
              {t("contracts.issue.skipped_csv")}
            </button>
          </div>
          <ul className="max-h-60 overflow-y-auto rounded-lg border border-warning-border bg-warning-soft divide-y divide-warning-border text-xs text-warning">
            {outcome.skipped.map((skip, index) => (
              <li key={index} className="px-3 py-1.5">
                {skip.row ? `${t("contracts.import.row", { row: skip.row })} · ` : ""}
                {skip.name ? `${skip.name} — ` : ""}
                {skip.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <IssuedChildren id={id} refreshKey={outcome?.issued ?? 0} />
    </section>
  );
}

/** Энэ мастераас тараагдсан гэрээнүүд, тус бүрийн төлөвтэйгөө. */
function IssuedChildren({ id, refreshKey }: { id: string; refreshKey: number }) {
  const { t } = useI18n();
  const [children, setChildren] = useState<ContractRow[]>([]);

  React.useEffect(() => {
    let alive = true;
    contracts.list()
      .then((res) => {
        if (alive) setChildren(res.contracts.filter((row) => row.parent_document_id === id));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [id, refreshKey]);

  if (children.length === 0) return null;
  return (
    <div className="border-t border-line pt-3 space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t("contracts.issue.children", { count: children.length })}
      </h3>
      {children.map((child) => (
        <Link
          key={child.id}
          href={`/module/documents/contracts/${child.id}`}
          className="w-full flex items-center gap-2 text-left text-sm rounded-lg px-2 py-1.5 min-h-9 hover:bg-surface-hover"
        >
          <span className="grow text-foreground">{child.counterparties || child.title}</span>
          <span className="font-mono text-xs text-muted">{child.signed_count}/{child.required_count}</span>
          <ContractBadge state={child.contract_state} />
        </Link>
      ))}
    </div>
  );
}
