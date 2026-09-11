"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { MembershipTransfer } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, Modal } from "@/components/ui";
import { memberDate } from "@/lib/memberFormat";

export function transferErrorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : "";
  return t(message.startsWith("transfer_") || message === "branch_transfer_required" ? `membership.${message}` : "membership.transfer_failed");
}

export default function MembershipTransfers({ memberships, branches, requests, reload }: {
  memberships: Array<{ id: string; slug: string; name: string }>;
  branches: Array<{ slug: string; name: string }>;
  requests: MembershipTransfer[];
  reload: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelID, setCancelID] = useState<string | null>(null);
  const pending = requests.some(request => request.status === "PENDING");
  const destinations = branches.filter(branch => !memberships.some(org => org.slug === branch.slug));
  const source = from || memberships[0]?.id || "";
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api.requestTransfer(source, slug, message.trim()); setOpen(false); setMessage(""); setSlug(""); await reload(); }
    catch (err) { setError(transferErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    setBusy(true); setError("");
    try { await api.cancelTransfer(id); setCancelID(null); await reload(); }
    catch (err) { setError(transferErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  if (!memberships.length && !requests.length) return null;
  return <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
    <h2 className="text-lg font-semibold">{t("membership.transfer_title")}</h2>
    <p className="text-sm text-muted">{t("membership.transfer_hint")}</p>
    {error && <Banner tone="error" message={error} />}
    {requests.map(request => <article key={request.id} className="space-y-2 rounded-lg border border-line p-4">
      <p className="font-medium">{request.from_name} → {request.to_name}</p>
      <p role="status" className={`w-fit rounded-sm px-2 py-1 text-xs font-medium ${request.status === "PENDING" ? "bg-warning-soft text-warning" : request.status === "ACCEPTED" ? "bg-success-soft text-success" : "bg-neutral-soft text-neutral"}`}>{t(`membership.transfer_${request.status.toLowerCase()}`)}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-muted">{request.message}</p>
      <time className="block text-xs text-muted tabular-nums" dateTime={request.created_at}>{memberDate(request.created_at)}</time>
      {request.status === "PENDING" && <button disabled={busy} onClick={() => { setCancelID(request.id); setError(""); }} className="min-h-11 rounded-md border border-input px-4 disabled:opacity-50">{t("membership.transfer_cancel")}</button>}
    </article>)}
    {!pending && destinations.length > 0 && memberships.length > 0 && !open && <button onClick={() => setOpen(true)} className="min-h-11 rounded-lg border border-line px-4">{t("membership.transfer_start")}</button>}
    {!pending && open && <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2"><span>{t("membership.transfer_from")}</span><select required value={source} onChange={event => setFrom(event.target.value)} className={`${fieldClass} min-h-11 w-full`}>
        {memberships.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
      </select></label>
      <label className="block space-y-2"><span>{t("membership.transfer_to")}</span><select required value={slug} onChange={event => setSlug(event.target.value)} className={`${fieldClass} min-h-11 w-full`}>
        <option value="">{t("membership.branch_pick")}</option>{destinations.map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}
      </select></label>
      <label className="block space-y-2"><span>{t("membership.transfer_reason")}</span><textarea required maxLength={500} rows={3} value={message} onChange={event => setMessage(event.target.value)} className={`${fieldClass} w-full`} /></label>
      <button disabled={busy || !source || !slug || !message.trim()} className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("membership.transfer_submit")}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 w-full rounded-lg border border-line px-4">{t("membership.transfer_close")}</button>
    </form>}
    {cancelID && <Modal label={t("membership.transfer_cancel_confirm")} onClose={() => { if (!busy) setCancelID(null); }}>
      <h2>{t("membership.transfer_cancel_confirm")}</h2>
      {error && <Banner tone="error" message={error} />}
      <div className="mt-6 flex flex-wrap justify-end gap-3"><button disabled={busy} onClick={() => setCancelID(null)} className="min-h-11 rounded-md border border-input px-4">{t("membership.back")}</button><button disabled={busy} aria-busy={busy} onClick={() => void cancel(cancelID)} className="min-h-11 rounded-md bg-accent px-4 text-on-accent">{t("membership.transfer_cancel")}</button></div>
    </Modal>}
  </section>;
}
