"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useAccess } from "@/lib/access";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Banner, LoadingBlock, PageHeader, rowActionClass, useConfirm } from "@/components/ui";
import { ActionMessage, useDocTypeLabel } from "@/components/documents/shared";
import { Plus, Save, Trash2, Workflow as WorkflowIcon } from "lucide-react";

interface Step {
  order?: number;
  name: string;
  signer_reg_number: string;
}

interface Chain {
  doc_type: string;
  steps: Step[];
}

/**
 * Document workflows: the ordered approval chain each document type needs. One
 * step per signature; a type with no steps is approved by a single signature,
 * which is how the app behaved before chains existed.
 */
export default function DocumentWorkflowsPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const docTypeLabel = useDocTypeLabel();
  const { can } = useAccess();
  const mayManage = can("documents.manage");

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionMessage | null>(null);

  // The server answers with a row for every document type, so an empty list can only
  // mean the load failed — hence `failed` below rather than an empty table. Rendering
  // the table anyway left a blank page that reads as "this tenant has no document
  // types" the moment the error banner is dismissed.
  const {
    data: chains,
    loading,
    failed: loadFailed,
    setData: setChains,
  } = useResource(async () => (await api.getDocumentWorkflows()) || [], {
    initial: [] as Chain[],
    onError: (err: any) =>
      setMessage({ type: "error", text: errorMessage(err, { fallback: "documents.message.workflows_failed" }) }),
  });

  const editChain = (docType: string, steps: Step[]) =>
    setChains((current) => current.map((c) => (c.doc_type === docType ? { ...c, steps } : c)));

  const addStep = (chain: Chain) => editChain(chain.doc_type, [...chain.steps, { name: "", signer_reg_number: "" }]);

  // Asked first: a step removed by a stray click takes its name and signer with
  // it, and nothing on the row says it was ever there.
  const removeStep = async (chain: Chain, index: number) => {
    const step = chain.steps[index];
    if (step.name.trim() || step.signer_reg_number.trim()) {
      const ok = await confirm({
        title: t("documents.confirm.remove_step_title"),
        body: t("documents.confirm.remove_step_body", { n: index + 1, name: step.name.trim() || "—" }),
        confirmLabel: t("base.action.delete"),
        tone: "danger",
      });
      if (!ok) return;
    }
    editChain(
      chain.doc_type,
      chain.steps.filter((_, i) => i !== index)
    );
  };

  const editStep = (chain: Chain, index: number, patch: Partial<Step>) =>
    editChain(
      chain.doc_type,
      chain.steps.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );

  const save = async (chain: Chain) => {
    setBusy(chain.doc_type);
    setMessage(null);
    try {
      const saved = await api.saveDocumentWorkflow(
        chain.doc_type,
        chain.steps.map((step) => ({ name: step.name, signer_reg_number: step.signer_reg_number }))
      );
      setMessage({ type: "success", text: t("documents.message.workflow_saved", { type: docTypeLabel(chain.doc_type) }) });
      // Only the chain that was saved is replaced, with what the server stored.
      // Reloading everything discarded steps the operator had typed into the other
      // document types under a banner saying only this one was saved.
      //
      // And only if this row still holds what was sent. The inputs stay editable while
      // the request is in flight, so a step typed after clicking Save would otherwise be
      // replaced by the server's answer to the older chain — work discarded under a
      // banner saying the save succeeded.
      if (saved && Array.isArray((saved as Chain).steps)) {
        const sent = JSON.stringify(chain.steps);
        setChains((current) =>
          current.map((row) =>
            row.doc_type === chain.doc_type && JSON.stringify(row.steps) === sent
              ? { ...row, steps: (saved as Chain).steps }
              : row
          )
        );
      }
    } catch (err: any) {
      // The draft stays on screen: a refused save is usually one blank step name,
      // and reloading here threw away everything the operator had typed.
      setMessage({ type: "error", text: errorMessage(err, { fallback: "documents.message.workflows_failed" }) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<WorkflowIcon className="w-7 h-7 text-accent" />}
        title={t("documents.menu.workflows")}
        subtitle={t("documents.view.workflows_hint")}
      />

      {message && <Banner tone={message.type} message={message.text} onDismiss={() => setMessage(null)} />}

      {loading ? (
        <LoadingBlock label={t("documents.message.loading")} />
      ) : loadFailed ? (
        <div className="bg-surface border border-line rounded-xl p-8 text-center text-muted text-sm">
          {t("documents.message.workflows_failed")}
        </div>
      ) : (
        <div className="space-y-4">
          {chains.map((chain) => (
            <section key={chain.doc_type} className="bg-surface border border-line rounded-xl overflow-hidden">
              <header className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-line">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground text-sm">{docTypeLabel(chain.doc_type)}</span>
                  <span className="text-2xs text-muted">
                    {chain.steps.length === 0
                      ? t("documents.message.chain_single_signature")
                      : t("documents.message.chain_signature_count", { count: chain.steps.length })}
                  </span>
                </div>
                {mayManage && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addStep(chain)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 min-h-9 rounded-lg text-2xs font-semibold border border-input text-foreground hover:bg-surface-hover"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t("documents.action.add_step")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => save(chain)}
                      disabled={busy === chain.doc_type || chain.steps.some((s) => !s.name.trim())}
                      title={chain.steps.some((s) => !s.name.trim()) ? t("documents.message.step_needs_name") : undefined}
                      className={rowActionClass}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{t("base.action.save")}</span>
                    </button>
                  </div>
                )}
              </header>

              {chain.steps.length === 0 ? (
                <p className="px-4 py-5 text-xs text-muted">{t("documents.message.no_steps")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {chain.steps.map((step, index) => (
                    <li key={index} className="px-4 py-3 flex flex-wrap items-end gap-3">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-accent-soft text-accent text-2xs font-semibold grid place-items-center">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-[180px]">
                        <label htmlFor={`step-${chain.doc_type}-${index}-name`} className="block text-2xs font-semibold text-muted mb-1">
                          {t("documents.field.step_name")}
                        </label>
                        <input
                          id={`step-${chain.doc_type}-${index}-name`}
                          type="text"
                          value={step.name}
                          disabled={!mayManage}
                          onChange={(e) => editStep(chain, index, { name: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs border border-input rounded-lg focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <label htmlFor={`step-${chain.doc_type}-${index}-signer`} className="block text-2xs font-semibold text-muted mb-1">
                          {t("documents.field.step_signer")}
                        </label>
                        {/* The placeholder is the Cyrillic form, because that is what
                            eID vouches for and what the step is compared against: an
                            example in Latin letters guides an operator into a step no
                            live signature can ever fill. Same example as the dialog. */}
                        <input
                          id={`step-${chain.doc_type}-${index}-signer`}
                          type="text"
                          placeholder="УБ99010111"
                          value={step.signer_reg_number}
                          disabled={!mayManage}
                          onChange={(e) => editStep(chain, index, { signer_reg_number: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs border border-input rounded-lg focus:ring-2 focus:ring-ring font-mono"
                        />
                      </div>
                      {mayManage && (
                        <button
                          type="button"
                          onClick={() => void removeStep(chain, index)}
                          className="min-h-9 min-w-9 inline-flex items-center justify-center p-1.5 rounded-lg border border-danger-border text-danger hover:bg-danger-soft"
                          aria-label={t("base.action.delete")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">{t("documents.message.step_signer_hint")}</p>
    </div>
  );
}
