"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PenLine,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  esign,
  saveBlob,
  type Representation,
  type SignSession,
} from "@/lib/esign";
import { useI18n } from "@/lib/i18n";
import { ErrorNote, FileDropzone, fieldClass, formatBytes, selectClass } from "@/components/ui";
import { errorCode, useErrorMessage } from "./shared";
import { EidWaitingPanel } from "./EidWaiting";

/**
 * Citizen PDF signing with eID Mongolia (PIN2).
 *
 * Pick a file → check it (name, size, pages, a preview, and whose name it is
 * signed in) → a verification code appears → confirm with PIN2 in the eID
 * Mongolia app → poll → download the signed PDF.
 *
 * The check step is new and deliberate: picking a file used to start the
 * ceremony straight away, so a mis-click in the file dialog sent the wrong
 * contract to the citizen's phone with nothing on screen to say which one.
 *
 * Signing in an organisation's name still uses the citizen's personal PIN2
 * certificate; eID checks the representation right when the ceremony starts.
 * It is a delegation record, not a company seal.
 */
type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; file: File }
  | { kind: "uploading"; file: File; orgName?: string }
  // The account is not linked to eID, so who signs has to be asked rather than
  // inferred. The chosen file is carried through so the citizen does not have
  // to pick it again after answering.
  | { kind: "identity"; file: File; orgName?: string; message: string }
  | { kind: "waiting"; file: File; session: SignSession; orgName?: string }
  | { kind: "completed"; session: SignSession; orgName?: string }
  // The file is kept so Retry does not send the citizen back to the picker.
  | { kind: "error"; message: string; file?: File };

/**
 * Guard the upload in the browser so a citizen on a slow connection is told
 * immediately instead of pushing 25MB up the wire only to meet a 413. It has
 * to stay in step with the backend's policy limit and the edge proxy's
 * client_max_body_size.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * How long to wait before asking again after the server answers "still
 * pending".
 *
 * The reference implementation polls on a fixed 1.5s interval because its
 * status endpoint returns immediately. Ours long-polls for up to 20 seconds,
 * so a fixed interval would stack a dozen concurrent requests against the same
 * ceremony. Each request is therefore issued only after the previous one has
 * answered, and this is the pause between them.
 */
const POLL_PAUSE_MS = 1500;

/** Which of the four steps a phase belongs to, for the indicator. */
function stepOf(phase: Phase): number {
  switch (phase.kind) {
    case "idle":
      return 0;
    case "confirm":
    case "identity":
      return 1;
    case "uploading":
    case "waiting":
      return 2;
    case "completed":
      return 3;
    case "error":
      return phase.file ? 2 : 0;
  }
}

/**
 * A PDF's page count, read from the file itself.
 *
 * Counts `/Type /Page` objects (not `/Pages`, the tree nodes). It is a cheap
 * estimate rather than a parse — a compressed object stream hides them — so a
 * zero is reported as "unknown" rather than as zero pages.
 */
async function countPdfPages(file: File): Promise<number | null> {
  try {
    const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
    const found = text.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
    return found > 0 ? found : null;
  } catch {
    return null;
  }
}

export default function EidSignView({ onSigned }: { onSigned?: () => void }) {
  const { t, locale } = useI18n();
  const describe = useErrorMessage();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [orgEtsi, setOrgEtsi] = useState("");
  // Kept for the session only, never persisted: it is a national identifier,
  // and it exists here purely so a citizen signing several documents does not
  // retype it each time.
  const [signerId, setSignerId] = useState("");
  const [orgs, setOrgs] = useState<Representation[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Flipped on unmount and on reset so an in-flight long poll cannot resurrect
  // a ceremony the user has already walked away from.
  const cancelled = useRef(false);

  const orgLabel = useCallback(
    (org: Representation) => (locale === "en" && org.org_name_en ? org.org_name_en : org.org_name),
    [locale],
  );

  const selectedOrg = orgs.find((org) => org.org_etsi === orgEtsi);
  const selectedOrgName = selectedOrg ? orgLabel(selectedOrg) : undefined;

  useEffect(() => {
    let active = true;
    esign
      .organizations()
      .then((list) => active && setOrgs(list || []))
      .catch(() => active && setOrgs([]))
      .finally(() => active && setOrgsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  /** Polls until the ceremony reaches a terminal state. */
  const watch = useCallback(
    async (session: SignSession, file: File, orgName?: string) => {
      while (!cancelled.current) {
        let current: SignSession;
        try {
          current = await esign.session(session.session_id);
        } catch {
          // A transient failure is not a verdict. The ceremony is still open
          // on the citizen's phone, so keep waiting rather than declaring it
          // failed under them.
          await sleep(POLL_PAUSE_MS);
          continue;
        }
        if (cancelled.current) return;

        if (current.state === "completed") {
          setPhase({ kind: "completed", session: current, orgName });
          onSigned?.();
          return;
        }
        if (current.state === "rejected" || current.state === "expired" || current.state === "failed") {
          setPhase({
            kind: "error",
            file,
            message:
              current.state === "expired"
                ? t("esign.message.sign_expired")
                : current.state === "rejected"
                  ? t("esign.message.sign_rejected")
                  : t("esign.message.sign_failed"),
          });
          return;
        }
        await sleep(POLL_PAUSE_MS);
      }
    },
    [onSigned, t],
  );

  /** Starts a ceremony, asking who signs when the account cannot say. */
  async function start(file: File, orgName: string | undefined, signer: string) {
    cancelled.current = false;
    setPhase({ kind: "uploading", file, orgName });
    try {
      const session = await esign.signFile(file, orgEtsi || undefined, signer.trim() || undefined);
      if (cancelled.current) return;
      setPhase({ kind: "waiting", file, session, orgName });
      void watch(session, file, orgName);
    } catch (err) {
      const code = errorCode(err);
      // Not a dead end: the API takes an explicit signer, so ask for one and
      // keep the file rather than making the citizen start over.
      if (code === "NO_SIGNER_IDENTITY" || code === "INVALID_SIGNER") {
        setPhase({ kind: "identity", file, orgName, message: describe(err) });
        return;
      }
      setPhase({ kind: "error", file, message: describe(err, t("esign.message.sign_failed")) });
    }
  }

  function reset() {
    cancelled.current = true;
    setDownloadError(null);
    setPhase({ kind: "idle" });
  }

  async function cancel(session: SignSession, file: File) {
    cancelled.current = true;
    setCancelling(true);
    try {
      await esign.cancelSession(session.session_id);
    } catch {
      // The ceremony is abandoned from this side either way; a failed cancel
      // only leaves a row for the housekeeping sweep to close.
    }
    setCancelling(false);
    // Back to the check step with the same file: cancelling is usually "not
    // yet", not "never".
    setPhase({ kind: "confirm", file });
  }

  async function downloadSigned(session: SignSession) {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await esign.downloadSigned(session.session_id);
      saveBlob(blob, session.filename.replace(/\.pdf$/i, "") + "-signed.pdf");
    } catch (err) {
      // Inline, on the completed screen: the signature exists, and replacing
      // the screen with an error made it look as if it did not.
      setDownloadError(describe(err, t("esign.message.error_download_short")));
    } finally {
      setDownloading(false);
    }
  }

  const steps = [
    t("esign.eid.step_pick"),
    t("esign.eid.step_check"),
    t("esign.eid.step_phone"),
    t("esign.eid.step_download"),
  ];
  const currentStep = stepOf(phase);

  const cardClass = "bg-surface border border-line rounded-xl shadow-sm";
  const secondaryButton =
    "min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground text-sm font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50";
  const primaryButton =
    "min-h-11 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold px-5 py-2.5 rounded-lg inline-flex items-center gap-2 shadow-sm transition disabled:opacity-50";

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" aria-label={t("esign.eid.steps_label")}>
        {steps.map((label, index) => {
          const done = index < currentStep;
          const active = index === currentStep;
          return (
            <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-semibold border ${
                  done
                    ? "bg-success-soft text-success border-success-border"
                    : active
                      ? "bg-accent text-on-accent border-transparent"
                      : "bg-surface-2 text-muted border-line"
                }`}
              >
                {done ? <Check aria-hidden="true" className="w-3.5 h-3.5" /> : index + 1}
              </span>
              <span className={active ? "font-semibold text-foreground" : "text-muted"}>
                {label}
                {done && <span className="sr-only"> ({t("esign.eid.step_done")})</span>}
              </span>
              {index < steps.length - 1 && <span aria-hidden="true" className="w-6 h-px bg-line" />}
            </li>
          );
        })}
      </ol>

      {phase.kind === "idle" && (
        <section className={cardClass}>
          <header className="px-4 py-3 border-b border-line flex items-center gap-2">
            <PenLine aria-hidden="true" className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">{t("esign.view.pick_document")}</h2>
          </header>

          <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
            <div>
              <label
                htmlFor="esign-onbehalf"
                className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted"
              >
                <Building2 aria-hidden="true" className="w-3.5 h-3.5" />
                {t("esign.field.sign_as")}
              </label>
              <select
                id="esign-onbehalf"
                value={orgEtsi}
                onChange={(event) => setOrgEtsi(event.target.value)}
                disabled={orgsLoading}
                aria-describedby="esign-onbehalf-hint"
                className={`mt-1.5 ${selectClass} disabled:bg-surface-2`}
              >
                <option value="">{t("esign.field.sign_as_self")}</option>
                {orgs.map((org) => (
                  <option key={org.org_etsi} value={org.org_etsi}>
                    {orgLabel(org)}
                    {org.right_type ? ` (${org.right_type})` : ""}
                  </option>
                ))}
              </select>
              <p id="esign-onbehalf-hint" className="text-xs text-muted mt-1.5">
                {orgEtsi
                  ? t("esign.message.on_behalf_hint")
                  : !orgsLoading && orgs.length === 0
                    ? t("esign.message.no_organizations")
                    : t("esign.message.sign_as_hint")}
              </p>
            </div>

            <FileDropzone
              label={t("esign.action.pick_pdf")}
              accept=".pdf,application/pdf"
              maxBytes={MAX_UPLOAD_BYTES}
              onFile={(file) => setPhase({ kind: "confirm", file })}
            />
          </div>
        </section>
      )}

      {phase.kind === "confirm" && (
        <ConfirmFile
          file={phase.file}
          orgName={selectedOrgName}
          onBack={reset}
          onStart={() => void start(phase.file, selectedOrgName, signerId)}
        />
      )}

      {phase.kind === "identity" && (
        <section className={cardClass}>
          <header className="px-4 py-3 border-b border-line flex items-center gap-2">
            <UserRound aria-hidden="true" className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">{t("esign.view.signer_identity")}</h2>
          </header>

          <form
            className="px-4 py-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (signerId.trim()) void start(phase.file, phase.orgName, signerId);
            }}
          >
            <p role="status" className="text-sm text-muted max-w-md mx-auto text-center">
              {phase.message}
            </p>

            <div className="max-w-sm mx-auto mt-5">
              <label htmlFor="esign-signer-id" className="block text-xs font-semibold text-foreground mb-1">
                {t("esign.field.signer_id")} *
              </label>
              <input
                id="esign-signer-id"
                value={signerId}
                onChange={(event) => setSignerId(event.target.value.toUpperCase())}
                placeholder={t("esign.field.signer_id_placeholder")}
                aria-describedby="esign-signer-id-hint"
                required
                autoFocus
                className={fieldClass}
              />
              <p id="esign-signer-id-hint" className="text-xs text-muted mt-2">
                {t("esign.message.signer_id_hint")}
              </p>
              <p className="text-xs text-muted mt-1">{t("esign.message.signer_id_link_hint")}</p>

              <p className="text-xs text-muted mt-4 inline-flex items-center gap-1.5">
                <FileText aria-hidden="true" className="w-3.5 h-3.5" />
                {phase.file.name}
              </p>
            </div>

            <div className="mt-5 flex gap-2.5 justify-center flex-wrap">
              <button type="submit" disabled={!signerId.trim()} className={primaryButton}>
                {t("esign.action.continue_signing")}
              </button>
              <button type="button" onClick={reset} className={secondaryButton}>
                <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
                {t("base.action.cancel")}
              </button>
            </div>
          </form>
        </section>
      )}

      {phase.kind === "uploading" && (
        <section className={`${cardClass} p-8 text-center`} role="status" aria-live="polite">
          <Clock aria-hidden="true" className="w-7 h-7 text-accent mx-auto animate-pulse" />
          <p className="font-semibold text-foreground mt-3">{t("esign.message.uploading")}</p>
          <p className="text-sm text-muted mt-1 inline-flex items-center gap-1.5">
            <FileText aria-hidden="true" className="w-3.5 h-3.5" />
            {phase.file.name}
          </p>
        </section>
      )}

      {phase.kind === "waiting" && (
        <section className={`${cardClass} p-8`}>
          <EidWaitingPanel
            code={phase.session.verification_code}
            filename={phase.session.filename}
            orgName={phase.orgName}
            expiresAt={phase.session.expires_at}
            cancelling={cancelling}
            onCancel={() => void cancel(phase.session, phase.file)}
          />
        </section>
      )}

      {phase.kind === "completed" && (
        <section className={`${cardClass} p-8 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-success-soft text-success inline-flex items-center justify-center">
            <ShieldCheck aria-hidden="true" className="w-7 h-7" />
          </div>
          <h2 role="status" className="text-lg font-semibold text-foreground mt-3.5">
            {t("esign.message.sign_success")}
          </h2>
          <p className="text-sm text-muted mt-1">{phase.session.filename}</p>
          {phase.orgName && (
            <p className="text-sm text-accent mt-1 flex items-center justify-center gap-1.5">
              <Building2 aria-hidden="true" className="w-3.5 h-3.5" />
              {t("esign.message.on_behalf_of", { org: phase.orgName })}
            </p>
          )}
          {phase.session.certificate_level && (
            <p className="text-xs text-muted mt-2 font-mono">{phase.session.certificate_level}</p>
          )}

          {downloadError && <ErrorNote className="mt-4 max-w-md mx-auto text-left">{downloadError}</ErrorNote>}

          <div className="mt-5 flex gap-2.5 justify-center flex-wrap">
            <button
              type="button"
              onClick={() => downloadSigned(phase.session)}
              disabled={downloading}
              aria-busy={downloading || undefined}
              className={primaryButton}
            >
              {downloading ? (
                <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="w-4 h-4" />
              )}
              {downloadError ? t("base.action.retry") : t("base.action.download")}
            </button>
            <button type="button" onClick={reset} className={secondaryButton}>
              <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
              {t("esign.action.sign_another")}
            </button>
          </div>
        </section>
      )}

      {phase.kind === "error" && (
        <section className={`${cardClass} p-8 text-center`}>
          <p role="alert" className="font-semibold text-danger">
            {phase.message}
          </p>
          {phase.file && (
            <p className="text-sm text-muted mt-1 inline-flex items-center gap-1.5">
              <FileText aria-hidden="true" className="w-3.5 h-3.5" />
              {phase.file.name}
            </p>
          )}
          <div className="mt-4 flex gap-2.5 justify-center flex-wrap">
            {phase.file && (
              <button
                type="button"
                onClick={() => void start(phase.file as File, selectedOrgName, signerId)}
                className={primaryButton}
              >
                <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
                {t("base.action.retry")}
              </button>
            )}
            <button type="button" onClick={reset} className={secondaryButton}>
              {phase.file ? t("esign.eid.pick_other") : t("base.action.retry")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The check before the ceremony: what is about to be sent to the phone, in
 * whose name, and what it looks like.
 */
function ConfirmFile({
  file,
  orgName,
  onBack,
  onStart,
}: {
  file: File;
  orgName?: string;
  onBack: () => void;
  onStart: () => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    let active = true;
    void countPdfPages(file).then((count) => active && setPages(count));
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <section className="bg-surface border border-line rounded-xl shadow-sm" aria-labelledby="esign-confirm-title">
      <header className="px-4 py-3 border-b border-line flex items-center gap-2">
        <FileText aria-hidden="true" className="w-4 h-4 text-accent" />
        <h2 id="esign-confirm-title" className="text-sm font-semibold text-foreground">
          {t("esign.eid.confirm_title")}
        </h2>
      </header>
      <div className="p-4 grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="min-h-[18rem] rounded-lg border border-line bg-surface-2 overflow-hidden">
          {url && (
            <object data={url} type="application/pdf" className="w-full h-[24rem]" aria-label={file.name}>
              <div className="p-6 text-sm text-muted text-center">
                <p>{t("esign.eid.preview_unavailable")}</p>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-accent underline"
                >
                  <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
                  {t("esign.eid.open_preview")}
                </a>
              </div>
            </object>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <dl className="space-y-2">
            <div>
              <dt className="text-2xs uppercase tracking-wider text-muted">{t("esign.field.document")}</dt>
              <dd className="text-foreground font-medium break-all">{file.name}</dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wider text-muted">{t("esign.eid.size")}</dt>
              <dd className="text-foreground">{formatBytes(file.size)}</dd>
            </div>
            {pages !== null && (
              <div>
                <dt className="text-2xs uppercase tracking-wider text-muted">{t("esign.field.pages")}</dt>
                <dd className="text-foreground">{pages}</dd>
              </div>
            )}
            <div>
              <dt className="text-2xs uppercase tracking-wider text-muted">{t("esign.field.sign_as")}</dt>
              <dd className="text-foreground">
                {orgName ? t("esign.message.on_behalf_of", { org: orgName }) : t("esign.field.sign_as_self")}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted">{t("esign.eid.confirm_note")}</p>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent underline">
              <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
              {t("esign.eid.open_preview")}
            </a>
          )}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onStart}
              className="min-h-11 bg-accent hover:bg-accent-hover text-on-accent text-sm font-semibold px-4 py-2 rounded-lg inline-flex items-center justify-center gap-2"
            >
              <PenLine aria-hidden="true" className="w-4 h-4" />
              {t("esign.eid.start")}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground text-sm font-medium px-4 py-2 rounded-lg"
            >
              {t("esign.eid.pick_other")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
