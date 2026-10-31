"use client";

import React, { useCallback, useEffect, useState } from "react";
import { formatDay } from "@/lib/datetime";
import {
  CheckCircle,
  Clock,
  Download,
  FileText,
  PenTool,
  Plus,
  Eye,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  esign,
  saveBlob,
  type EsignDocument,
  type Settings,
  type SignSession,
} from "@/lib/esign";
import { useI18n } from "@/lib/i18n";
import EidSignView from "@/components/esign/EidSignView";
import SignaturePad from "@/components/esign/SignaturePad";
import {
  Banner,
  EmptyState,
  ErrorNote,
  FileDropzone,
  Loading,
  Modal,
  PageHeader,
  cardClass,
  fieldClass,
  tableHeadClass,
  useConfirm,
} from "@/components/ui";
import { EidWaitingPanel } from "@/components/esign/EidWaiting";
import { Badge, useErrorMessage, formatBytes } from "@/components/esign/shared";

/**
 * The documents screen. Two things live here because they are two answers to
 * the same question — "sign this PDF":
 *
 *   Sign now — pick a file and sign it with eID Mongolia in one pass. Nothing
 *              is stored beyond the ceremony unless the citizen keeps it.
 *   Documents — the register of PDFs held for signing, their status and the
 *              signed copies.
 */
type Tab = "sign" | "documents";

export default function EsignPage() {
  const { t } = useI18n();
  const describe = useErrorMessage();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("sign");
  const [documents, setDocuments] = useState<EsignDocument[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [signDoc, setSignDoc] = useState<EsignDocument | null>(null);

  const report = useCallback((err: unknown) => setError(describe(err, t("base.message.error"))), [describe, t]);

  const load = useCallback(async () => {
    try {
      const [page, config] = await Promise.all([esign.documents({ limit: 100 }), esign.settings()]);
      setDocuments(page.items || []);
      setSettings(config);
    } catch (err) {
      report(err);
    }
  }, [report]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const download = async (doc: EsignDocument, variant: "original" | "signed") => {
    try {
      const blob = await esign.downloadDocument(doc.id, variant);
      const name =
        variant === "signed" ? doc.file_name.replace(/\.pdf$/i, "") + "-signed.pdf" : doc.file_name;
      saveBlob(blob, name);
    } catch (err) {
      report(err);
    }
  };

  const archive = async (doc: EsignDocument) => {
    // Signed PDFs are evidence, so this archives rather than destroys — say so
    // before asking, because "delete" reads as irreversible.
    const ok = await confirm({
      title: t("esign.action.archive"),
      body: t("esign.message.confirm_archive", { title: doc.title }),
      confirmLabel: t("esign.action.archive"),
    });
    if (!ok) return;
    try {
      await esign.remove(doc.id);
      setNotice(t("esign.message.archived"));
      await load();
    } catch (err) {
      report(err);
    }
  };

  const hsmAvailable = settings ? !settings.policy.require_eid : true;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PenTool aria-hidden="true" className="w-7 h-7 text-accent" />}
        title={t("esign.view.title")}
        subtitle={t("esign.view.subtitle")}
        actions={
          tab === "documents" ? (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="min-h-11 bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              {t("esign.action.upload")}
            </button>
          ) : undefined
        }
      />

      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice(null)} />}

      <nav className="flex gap-1 border-b border-line" role="tablist">
        <TabButton active={tab === "sign"} onClick={() => setTab("sign")} icon={<Smartphone className="w-4 h-4" />}>
          {t("esign.view.tab_sign")}
        </TabButton>
        <TabButton active={tab === "documents"} onClick={() => setTab("documents")} icon={<FileText className="w-4 h-4" />}>
          {t("esign.view.tab_documents")}
        </TabButton>
      </nav>

      {tab === "sign" && <EidSignView onSigned={load} />}

      {tab === "documents" && (
        <>
          {loading ? (
            <Loading label={t("esign.message.loading")} />
          ) : (
            <div className={`${cardClass} overflow-x-auto`}>
              <table className="w-full text-left text-xs text-muted">
                <thead className={tableHeadClass}>
                  <tr>
                    <th className="px-4 py-3">{t("esign.field.document")}</th>
                    <th className="px-4 py-3">{t("esign.field.pages")}</th>
                    <th className="px-4 py-3">{t("base.field.status")}</th>
                    <th className="px-4 py-3">{t("esign.field.signer")}</th>
                    <th className="px-4 py-3">{t("base.field.date")}</th>
                    <th className="px-4 py-3 text-right">{t("base.field.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {documents.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState message={t("esign.message.empty")} />
                      </td>
                    </tr>
                  )}
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-muted" />
                          {doc.title}
                        </div>
                        <div className="text-muted font-mono mt-0.5">
                          {doc.file_name} · {formatBytes(doc.byte_size)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{doc.page_count}</td>
                      <td className="px-4 py-3">
                        {doc.status === "SIGNED" ? (
                          <Badge tone="success">
                            <CheckCircle className="w-3 h-3" />
                            {t("esign.state.signed")}
                          </Badge>
                        ) : (
                          <Badge tone="warning">
                            <Clock className="w-3 h-3" />
                            {t("esign.state.pending")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {doc.signer_name || doc.signer_reg_no ? (
                          <div className="space-y-0.5">
                            <Badge tone="info">
                              <ShieldCheck className="w-3 h-3" />
                              {doc.signer_name || doc.signer_reg_no}
                            </Badge>
                            {doc.on_behalf_of_name && (
                              <div className="text-2xs text-muted">{doc.on_behalf_of_name}</div>
                            )}
                            <div className="text-2xs text-muted font-mono">
                              {doc.provider}
                              {doc.certificate_level ? ` · ${doc.certificate_level}` : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDay(doc.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {doc.status !== "SIGNED" && (
                            <>
                              <button
                                type="button"
                                onClick={() => setSignDoc(doc)}
                                disabled={!hsmAvailable}
                                title={hsmAvailable ? undefined : t("esign.message.hsm_disabled")}
                                className="min-h-9 bg-surface-2 hover:bg-surface-hover border border-line disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-2xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
                              >
                                <PenTool className="w-3 h-3" />
                                {t("esign.action.sign_hsm")}
                              </button>
                              <SignWithEidButton document={doc} onDone={load} onError={report} />
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => download(doc, "original")}
                            className="min-h-9 bg-surface-2 hover:bg-surface-hover border border-line text-foreground text-2xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
                            title={t("esign.action.download_original")}
                          >
                            <Download className="w-3 h-3" />
                            {t("esign.action.original_short")}
                          </button>
                          {doc.status === "SIGNED" && (
                            <button
                              type="button"
                              onClick={() => download(doc, "signed")}
                              className="min-h-9 bg-success-soft hover:brightness-95 text-success border border-success-border text-2xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
                              title={t("esign.action.download_signed")}
                            >
                              <Download className="w-3 h-3" />
                              {t("esign.action.signed_short")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => archive(doc)}
                            className="min-h-9 min-w-9 inline-flex items-center justify-center text-muted hover:text-danger p-1.5 rounded-lg"
                            title={t("esign.action.archive")}
                            aria-label={t("esign.action.archive")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showUpload && (
        <UploadModal
          maxMB={settings?.policy.max_upload_mb ?? 25}
          onClose={() => setShowUpload(false)}
          onUploaded={async () => {
            setShowUpload(false);
            setNotice(t("esign.message.uploaded"));
            await load();
          }}
        />
      )}

      {signDoc && (
        <HSMSignModal
          doc={signDoc}
          onClose={() => setSignDoc(null)}
          onSigned={async () => {
            setSignDoc(null);
            setNotice(t("esign.message.signed"));
            await load();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px flex items-center gap-2 transition ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Signs a stored document with eID. It reuses the same ceremony as the sign
 * tab but keeps the citizen on the register, which is what an operator working
 * through a queue of uploads wants.
 *
 * The wait happens in a dialog rather than in the 11px chip the button used to
 * turn into: the code has to be compared digit for digit against the phone,
 * and the signer needs a way to cancel, to see how long is left, and to be
 * told — differently — whether it timed out or was declined.
 */
type EidOutcome = "expired" | "rejected" | "failed";

function SignWithEidButton({
  document: doc,
  onDone,
  onError,
}: {
  document: EsignDocument;
  onDone: () => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const { t } = useI18n();
  const [session, setSession] = useState<SignSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [outcome, setOutcome] = useState<EidOutcome | null>(null);
  const cancelled = React.useRef(false);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const start = async () => {
    cancelled.current = false;
    setOutcome(null);
    setStarting(true);
    try {
      const opened = await esign.signDocument(doc.id);
      if (cancelled.current) return;
      setSession(opened);
      setStarting(false);
      while (!cancelled.current) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelled.current) return;
        let current;
        try {
          current = await esign.session(opened.session_id);
        } catch {
          continue; // transient — the ceremony is still open on the phone
        }
        if (cancelled.current) return;
        if (current.state === "completed") {
          setSession(null);
          await onDone();
          return;
        }
        if (current.state !== "pending") {
          setOutcome(current.state === "expired" ? "expired" : current.state === "rejected" ? "rejected" : "failed");
          return;
        }
      }
    } catch (err) {
      setSession(null);
      onError(err);
    } finally {
      if (!cancelled.current) setStarting(false);
    }
  };

  const close = async () => {
    cancelled.current = true;
    if (session && !outcome) {
      setCancelling(true);
      try {
        await esign.cancelSession(session.session_id);
      } catch {
        // Abandoned from this side either way; the sweep closes the row.
      }
      setCancelling(false);
    }
    setSession(null);
    setOutcome(null);
  };

  const outcomeText =
    outcome === "expired"
      ? t("esign.message.sign_expired")
      : outcome === "rejected"
        ? t("esign.message.sign_rejected")
        : t("esign.message.sign_failed");

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={starting || !!session}
        aria-busy={starting || undefined}
        className="min-h-9 bg-accent hover:bg-accent-hover text-on-accent text-2xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60"
      >
        <Smartphone aria-hidden="true" className={`w-3 h-3 ${starting ? "animate-pulse" : ""}`} />
        {t("esign.action.sign_eid")}
      </button>
      {session && (
        <Modal
          label={t("esign.view.confirm_on_phone")}
          onClose={() => void close()}
          dismissible={!cancelling}
          dirty={false}
        >
          {outcome ? (
            <div className="text-center space-y-4">
              <XCircle aria-hidden="true" className="w-10 h-10 mx-auto text-danger" />
              <p role="alert" className="font-semibold text-danger">
                {outcomeText}
              </p>
              <p className="text-sm text-muted">{doc.title}</p>
              <div className="flex justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSession(null);
                    void start();
                  }}
                  className="min-h-11 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  {t("base.action.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => void close()}
                  className="min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {t("base.action.close")}
                </button>
              </div>
            </div>
          ) : (
            <EidWaitingPanel
              code={session.verification_code}
              filename={doc.title}
              orgName={session.on_behalf_of_name}
              expiresAt={session.expires_at}
              cancelling={cancelling}
              onCancel={() => void close()}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function UploadModal({
  maxMB,
  onClose,
  onUploaded,
}: {
  maxMB: number;
  onClose: () => void;
  onUploaded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const describe = useErrorMessage();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await esign.upload(file, title);
      await onUploaded();
    } catch (err) {
      setError(describe(err, t("base.message.error")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label={t("esign.view.upload_title")} onClose={onClose} dismissible={!busy} dirty={!!file || !!title}>
      <h2 className="text-xl font-semibold text-foreground mb-4">{t("esign.view.upload_title")}</h2>
      {error && <div className="mb-3"><Banner tone="error" message={error} onDismiss={() => setError(null)} /></div>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="esign-title" className="block text-xs font-semibold text-foreground mb-1">
            {t("esign.field.title")}
          </label>
          <input
            id="esign-title"
            type="text"
            placeholder={t("esign.field.title_placeholder")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-describedby="esign-title-hint"
            className={fieldClass}
          />
          <p id="esign-title-hint" className="text-2xs text-muted mt-1">{t("esign.message.title_optional")}</p>
        </div>

        <FileDropzone
          id="esign-file"
          label={`${t("esign.field.file", { max: maxMB })} *`}
          accept=".pdf,application/pdf"
          maxBytes={maxMB * 1024 * 1024}
          file={file}
          onFile={setFile}
          onClear={() => setFile(null)}
          disabled={busy}
        />

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-1/2 min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground font-medium py-2 rounded-lg text-xs disabled:opacity-50"
          >
            {t("base.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !file}
            aria-busy={busy || undefined}
            className="w-1/2 min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-medium py-2 rounded-lg text-xs inline-flex items-center justify-center gap-1.5"
          >
            <Upload aria-hidden="true" className="w-3.5 h-3.5" />
            {busy ? t("esign.message.uploading") : t("esign.action.submit_upload")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The HSM rail: prove a certificate, draw a signature, the service stamps it. */
function HSMSignModal({
  doc,
  onClose,
  onSigned,
}: {
  doc: EsignDocument;
  onClose: () => void;
  onSigned: () => Promise<void>;
}) {
  const { t } = useI18n();
  const describe = useErrorMessage();
  const [phone, setPhone] = useState("");
  const [regNo, setRegNo] = useState("");
  const [cert, setCert] = useState<{ given_name: string; surname: string } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string } | { error: string } | "loading" | null>(null);

  // The object URL is the dialog's to release, once it goes.
  const previewUrl = React.useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const showPreview = async () => {
    if (preview && preview !== "loading" && "url" in preview) return;
    setPreview("loading");
    try {
      const blob = await esign.downloadDocument(doc.id, "original");
      previewUrl.current = URL.createObjectURL(blob);
      setPreview({ url: previewUrl.current });
    } catch (err) {
      setPreview({ error: describe(err, t("esign.message.error_download_short")) });
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setCert(await esign.checkCertificate({ phone_no: phone, civil_id: regNo }));
    } catch (err) {
      setError(describe(err, t("base.message.error")));
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (!cert || !signature) return;
    setBusy(true);
    setError(null);
    try {
      await esign.signWithHSM(doc.id, {
        phone_no: phone,
        signer_name: `${cert.surname} ${cert.given_name}`.trim(),
        signer_reg_no: regNo,
        // toDataURL yields "data:image/png;base64,…"; the API wants only the payload.
        signature_image64: signature.split(",")[1],
      });
      await onSigned();
    } catch (err) {
      setError(describe(err, t("base.message.error")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      scrollable
      className="my-8"
      label={t("esign.view.sign_title")}
      onClose={onClose}
      dismissible={!busy}
      dirty={!!signature || !!phone || !!regNo}
    >
      <h2 className="text-xl font-semibold text-foreground mb-1">{t("esign.view.sign_title")}</h2>
      <p className="text-xs text-muted mb-2">
        {t("esign.view.sign_placement", { title: doc.title, page: doc.page_count })}
      </p>
      <div className="mb-4">
        {preview && typeof preview === "object" && "url" in preview ? (
          <div className="space-y-2">
            <object
              data={preview.url}
              type="application/pdf"
              aria-label={doc.title}
              className="w-full h-72 rounded-lg border border-line bg-surface-2"
            >
              <p className="p-4 text-xs text-muted">{t("esign.eid.preview_unavailable")}</p>
            </object>
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent underline"
            >
              <Eye aria-hidden="true" className="w-3.5 h-3.5" />
              {t("esign.eid.open_preview")}
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void showPreview()}
            disabled={preview === "loading"}
            aria-busy={preview === "loading" || undefined}
            className="min-h-9 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-60"
          >
            <Eye aria-hidden="true" className="w-3.5 h-3.5" />
            {preview === "loading" ? t("base.message.loading") : t("esign.action.preview_document")}
          </button>
        )}
        {preview && typeof preview === "object" && "error" in preview && (
          <ErrorNote className="mt-2">{preview.error}</ErrorNote>
        )}
      </div>

      {error && <div className="mb-3"><Banner tone="error" message={error} onDismiss={() => setError(null)} /></div>}

      <div className="space-y-4">
        <div className="border border-line rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {t("esign.view.step_certificate")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="hsm-phone" className="block text-xs font-semibold text-foreground mb-1">
                {t("esign.field.phone")} *
              </label>
              <input
                id="hsm-phone"
                type="tel"
                placeholder="88001234"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={!!cert}
                className={`${fieldClass} disabled:bg-surface-2`}
              />
            </div>
            <div>
              <label htmlFor="hsm-reg" className="block text-xs font-semibold text-foreground mb-1">
                {t("esign.field.civil_id")} *
              </label>
              <input
                id="hsm-reg"
                type="text"
                placeholder="УА00112233"
                value={regNo}
                onChange={(event) => setRegNo(event.target.value)}
                disabled={!!cert}
                className={`${fieldClass} disabled:bg-surface-2`}
              />
            </div>
          </div>
          {cert ? (
            <div
              role="status"
              className="bg-success-soft border border-success-border text-success text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5"
            >
              <ShieldCheck aria-hidden="true" className="w-4 h-4" />
              {t("esign.message.certificate_valid", { name: `${cert.surname} ${cert.given_name}` })}
            </div>
          ) : (
            <button
              type="button"
              onClick={check}
              disabled={busy || !phone || !regNo}
              className="min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 rounded-lg"
            >
              {busy ? t("esign.message.checking") : t("esign.action.check_certificate")}
            </button>
          )}
        </div>

        <div className="border border-line rounded-lg p-4">
          <SignaturePad onChange={setSignature} disabled={!cert} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-1/2 min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground font-medium py-2 rounded-lg text-xs disabled:opacity-50"
          >
            {t("base.action.cancel")}
          </button>
          <button
            type="button"
            onClick={sign}
            disabled={busy || !cert || !signature}
            aria-busy={busy || undefined}
            className="w-1/2 min-h-11 bg-success-solid hover:brightness-110 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
          >
            <PenTool className="w-3.5 h-3.5" />
            {busy ? t("esign.message.signing") : t("esign.view.sign_title")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
