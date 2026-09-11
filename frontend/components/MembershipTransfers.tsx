"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { MembershipTransfer } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass } from "@/components/ui";

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
    try { await api.cancelTransfer(id); await reload(); }
    catch (err) { setError(transferErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  if (!memberships.length && !requests.length) return null;
  return <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
    <h2 className="text-lg font-semibold">{t("membership.transfer_title")}</h2>
    <p className="text-sm text-muted">{t("membership.transfer_hint")}</p>
    {error && <Banner tone="error" message={error} />}
    {requests.map(request => <article key={request.id} className="space-y-2 rounded-xl border border-line p-4">
      <p className="font-medium">{request.from_name} → {request.to_name}</p>
      <p role="status" className="text-sm text-accent">{t(`membership.transfer_${request.status.toLowerCase()}`)}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-muted">{request.message}</p>
      {request.status === "PENDING" && <button disabled={busy} onClick={() => void cancel(request.id)} className="min-h-11 rounded-lg border border-line px-4 disabled:opacity-50">{t("membership.transfer_cancel")}</button>}
    </article>)}
    {!pending && destinations.length > 0 && memberships.length > 0 && !open && <button onClick={() => setOpen(true)} className="min-h-11 rounded-lg border border-line px-4">{t("membership.transfer_start")}</button>}
    {!pending && open && <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2"><span>{t("membership.transfer_from")}</span><select required value={source} onChange={event => setFrom(event.target.value)} className={`${fieldClass} min-h-12 w-full`}>
        {memberships.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
      </select></label>
      <label className="block space-y-2"><span>{t("membership.transfer_to")}</span><select required value={slug} onChange={event => setSlug(event.target.value)} className={`${fieldClass} min-h-12 w-full`}>
        <option value="">{t("membership.branch_pick")}</option>{destinations.map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}
      </select></label>
      <label className="block space-y-2"><span>{t("membership.transfer_reason")}</span><textarea required maxLength={500} rows={3} value={message} onChange={event => setMessage(event.target.value)} className={`${fieldClass} w-full`} /></label>
      <button disabled={busy || !source || !slug || !message.trim()} className="min-h-12 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("membership.transfer_submit")}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)} className="min-h-11 w-full rounded-lg border border-line px-4">{t("membership.transfer_close")}</button>
    </form>}
  </section>;
}
