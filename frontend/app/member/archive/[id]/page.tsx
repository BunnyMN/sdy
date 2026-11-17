"use client";

/**
 * Нэг архивын баримт: дугаар, төрөл, агуулга, гарын үсэг зурагчдын явц, PDF
 * (урьдчилан харах, хувилбар бүрийг татах). Зурах ээлж болсон гишүүнд
 * «Гарын үсэг зурах», менежерт засах / илгээх / цуцлах.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CheckCircle2, Circle, Clock, Download, FileText, Pencil, PenLine, Repeat, Send, UserX, XCircle } from "lucide-react";

import ArchiveSign from "@/components/archive/ArchiveSign";
import SignerPicker, { type Signer } from "@/components/archive/SignerPicker";
import { archiveApi, archivePdfUrl, type ArchiveDocument, type ArchiveSigner } from "@/lib/api/archive";
import { ApiError } from "@/lib/errorMessage";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Badge, Banner, LoadingBlock, fieldClass, useConfirm } from "@/components/ui";
import { memberDate } from "@/lib/memberFormat";
import { ARCHIVE_PATH, archiveErrorKey, kindKey, progressText, statusKey, statusTone } from "@/lib/archive";

const btn = "inline-flex min-h-11 items-center gap-2 rounded-md border border-input px-4 text-sm disabled:opacity-50";

export default function ArchiveDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const errorMessage = useErrorMessage({ fallback: "events.archive.error.load" });
  const confirm = useConfirm();
  const [doc, setDoc] = useState<ArchiveDocument | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [replacement, setReplacement] = useState<Signer[]>([]);
  const [replaceReason, setReplaceReason] = useState("");

  const explain = useCallback((err: unknown) => {
    const key = archiveErrorKey(err);
    return key ? t(key) : errorMessage(err);
  }, [t, errorMessage]);

  useEffect(() => {
    let live = true;
    archiveApi.get(id)
      .then(r => { if (live) { setDoc(r.document); setReady(r.signing_ready); } })
      .catch(err => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 404) setDoc(null);
        else setError(explain(err));
      });
    return () => { live = false; };
  }, [id, round, explain]);
  const reload = useCallback(() => setRound(n => n + 1), []);

  async function act(run: () => Promise<{ document: ArchiveDocument }>, done: string) {
    setBusy(true); setError(""); setNotice("");
    try { setDoc((await run()).document); setNotice(done); }
    catch (err) { setError(explain(err)); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!doc || !(await confirm({ title: t("events.archive.send_confirm"), confirmLabel: t("events.archive.send") }))) return;
    await act(() => archiveApi.send(doc.id), t("events.archive.sent"));
  }

  async function cancel() {
    if (!doc) return;
    const answer = await confirm({
      title: t("events.archive.cancel_confirm", { title: doc.title }), confirmLabel: t("events.archive.cancel"), tone: "danger",
      reasonLabel: t("events.archive.cancel_reason"), reasonRequired: doc.status === "signing",
    });
    if (!answer) return;
    await act(() => archiveApi.cancel(doc.id, answer.reason), t("events.archive.status.cancelled"));
  }

  async function replaceSigners() {
    if (!doc) return;
    await act(() => archiveApi.replaceSigners(doc.id, replacement.map(s => s.user_id), replaceReason.trim()), t("events.archive.replaced_done"));
    setReplacing(false); setReplacement([]); setReplaceReason("");
  }

  if (doc === null) return <div className="mx-auto max-w-[860px] space-y-4"><h1 className="text-2xl font-semibold">{t("events.archive.not_found")}</h1>
    <Link href={ARCHIVE_PATH} className="text-sm underline">{t("events.archive.title")}</Link></div>;
  if (doc === undefined) return <div className="mx-auto max-w-[860px] space-y-4">{error ? <Banner tone="error" message={error} /> : <LoadingBlock />}</div>;

  const canEdit = doc.can_manage && doc.status === "draft";
  const signers = doc.signers ?? [];
  return <div className="mx-auto max-w-[860px] space-y-5 pb-6">
    <header className="space-y-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{t(kindKey(doc.kind))}</span><span>· {doc.number ? `№ ${doc.number}` : t("events.archive.no_number")}</span>
        <Badge tone={statusTone(doc.status)}>{t(statusKey(doc.status))}</Badge>
      </p>
      <h1 className="text-2xl font-semibold">{doc.title}</h1>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {doc.event_title && <><dt className="text-muted">{t("events.archive.event")}</dt><dd>{doc.event_id ? <Link href={`/module/events/${doc.event_id}`} className="underline">{doc.event_title}</Link> : doc.event_title}</dd></>}
        <dt className="text-muted">{t("events.archive.issued")}</dt><dd>{memberDate(doc.issued_at ?? doc.created_at)}</dd>
        {doc.created_by_name && <><dt className="text-muted">{t("events.archive.author")}</dt><dd>{doc.created_by_name}</dd></>}
      </dl>
    </header>

    {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}
    {error && <Banner tone="error" message={error} onDismiss={() => setError("")} />}
    {doc.status === "draft" && doc.draft_reason === "no_signers" && <Banner tone="warning" message={t("events.archive.no_signers_reason")} />}
    {doc.can_manage && doc.notice && (doc.status === "draft" || doc.status === "signing") && <Banner tone="warning" message={doc.notice} />}
    {doc.status === "cancelled" && doc.cancel_reason && <Banner tone="info" message={t("events.archive.cancelled_note", { reason: doc.cancel_reason })} />}

    {doc.my_turn && ready && <ArchiveSign documentID={doc.id} onSigned={reload} />}

    {doc.can_manage && (doc.status === "draft" || doc.status === "signing") && <div className="flex flex-wrap gap-2">
      {canEdit && <Link href={`${ARCHIVE_PATH}/${doc.id}/edit`} className={btn}><Pencil aria-hidden="true" className="h-4 w-4" />{t("events.archive.edit")}</Link>}
      {canEdit && <button type="button" disabled={busy || signers.length === 0} onClick={() => void send()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50">
        <Send aria-hidden="true" className="h-4 w-4" />{t("events.archive.send")}</button>}
      {doc.status === "signing" && <button type="button" disabled={busy} aria-expanded={replacing} onClick={() => setReplacing(v => !v)} className={btn}>
        <Repeat aria-hidden="true" className="h-4 w-4" />{t("events.archive.replace")}</button>}
      <button type="button" disabled={busy} onClick={() => void cancel()} className={`${btn} text-danger`}><Ban aria-hidden="true" className="h-4 w-4" />{t("events.archive.cancel")}</button>
    </div>}

    {replacing && doc.can_manage && doc.status === "signing" && <section aria-labelledby="archive-replace" className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 id="archive-replace" className="font-semibold">{t("events.archive.replace")}</h2>
        <p className="mt-1 text-xs text-muted">{t("events.archive.replace_hint")}</p>
      </div>
      <SignerPicker signers={replacement} setSigners={change => setReplacement(change)}
        exclude={signers.filter(s => s.status === "signed").map(s => s.user_id)} />
      <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("events.archive.replace_reason")}</span>
        <input required maxLength={500} value={replaceReason} onChange={e => setReplaceReason(e.target.value)} className={fieldClass} /></label>
      <button type="button" disabled={busy || replacement.length === 0 || !replaceReason.trim()} onClick={() => void replaceSigners()}
        className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-on-accent disabled:opacity-50">{t("events.archive.replace_save")}</button>
    </section>}

    <section aria-labelledby="archive-signers" className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="archive-signers" className="font-semibold">{t("events.archive.signers")}</h2>
        {signers.length > 0 && <span className="text-sm tabular-nums text-muted">{t("events.archive.progress", { progress: progressText(doc.signed_count, doc.signer_count) })}</span>}
      </div>
      {signers.length === 0 ? <p className="text-sm text-muted">{t("events.archive.form.none")}</p>
        : <ol className="divide-y divide-line">{signers.map(s => <SignerRow key={`${s.order}-${s.user_id}`} s={s} />)}</ol>}
    </section>

    {doc.kind !== "vote_protocol" && doc.body && <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <p className="whitespace-pre-wrap text-sm">{doc.body}</p></section>}
    {doc.kind === "vote_protocol" && <p className="text-sm text-muted">{t("events.archive.protocol_body")}</p>}

    <section aria-labelledby="archive-pdf" className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="archive-pdf" className="flex items-center gap-2 font-semibold"><FileText aria-hidden="true" className="h-5 w-5 text-accent" />{t("events.archive.pdf")}</h2>
        <a href={archivePdfUrl(doc.id)} className={btn}><Download aria-hidden="true" className="h-4 w-4" />{t("events.archive.download")}</a>
      </div>
      {doc.status === "draft" && <p className="text-xs text-muted">{t("events.archive.draft_preview")}</p>}
      <iframe key={`${doc.id}-${doc.revisions}`} title={t("events.archive.preview")} src={archivePdfUrl(doc.id, { inline: true })} className="h-[70vh] w-full rounded-md border border-line bg-surface-2" />
      {(doc.versions?.length ?? 0) > 0 && <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("events.archive.versions")}</h3>
        <ul className="divide-y divide-line text-sm">{doc.versions!.map(v => <li key={v.revision} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
          <span className="tabular-nums text-muted">r{v.revision}</span>
          <span className="flex-1">{v.revision === 0 ? t("events.archive.version_original") : t("events.archive.version_signed", { name: v.signer_name || "—" })}</span>
          <span className="text-xs text-muted">{memberDate(v.created_at)}</span>
          <code className="w-full truncate text-xs text-muted sm:w-auto" title={v.sha256}>{v.sha256.slice(0, 16)}…</code>
          <a href={archivePdfUrl(doc.id, { revision: v.revision })} className="text-accent underline">{t("events.archive.pdf")}</a>
        </li>)}</ul>
        <p className="text-xs text-muted">{t("events.archive.verify_hint")}</p>
      </div>}
    </section>
  </div>;
}

function SignerRow({ s }: { s: ArchiveSigner }) {
  const { t } = useI18n();
  const icon = s.status === "signed" ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success" />
    : s.current ? <PenLine aria-hidden="true" className="h-5 w-5 text-accent" />
    : s.status === "replaced" ? <UserX aria-hidden="true" className="h-5 w-5 text-muted" />
    : s.status === "refused" ? <XCircle aria-hidden="true" className="h-5 w-5 text-warning" />
    : s.status === "signing" ? <Clock aria-hidden="true" className="h-5 w-5 text-muted" />
    : <Circle aria-hidden="true" className="h-5 w-5 text-muted" />;
  return <li className="flex items-start gap-3 py-2.5">
    <span className="w-5 pt-0.5 text-sm tabular-nums text-muted">{s.order}.</span>
    {icon}
    <span className="min-w-0 flex-1 space-y-0.5 text-sm">
      <span className="block"><span className="font-medium">{s.name || "—"}</span>{s.position_title && <span className="text-muted"> · {s.position_title}</span>}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t(`events.archive.signer.${s.status}`)}{s.signed_at ? ` · ${memberDate(s.signed_at)}` : ""}</span>
        {s.current && <Badge tone="accent">{t("events.archive.signer.current")}</Badge>}
      </span>
      {s.cert_name && <span className="block text-xs text-muted">{t("events.archive.signer.cert", { name: s.cert_name })}</span>}
      {s.replace_reason && <span className="block text-xs text-muted">{t("events.archive.signer.replaced_reason", { reason: s.replace_reason })}</span>}
      {!s.has_eid && s.status !== "signed" && s.status !== "replaced" && <span className="block text-xs text-warning">{t("events.archive.form.no_eid")}</span>}
      {s.last_error && <span className="block break-words text-xs text-danger">{s.last_error}</span>}
    </span>
  </li>;
}
