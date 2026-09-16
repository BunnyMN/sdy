"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading, Modal } from "@/components/ui";
import { memberDate } from "@/lib/memberFormat";
import { transferErrorMessage } from "@/components/MembershipTransfers";

type Request = Awaited<ReturnType<typeof api.getTransferRequests>>["requests"][number];

export default function TransferRequests() {
  const { t } = useI18n();
  const { isAdmin, loading } = useAccess();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<{ request: Request; accept: boolean } | null>(null);
  const load = useCallback(async () => {
    try { setRequests((await api.getTransferRequests()).requests); setError(""); }
    catch (err) { setError(transferErrorMessage(err, t)); }
  }, [t]);
  useEffect(() => { if (!loading && isAdmin) void load(); }, [loading, isAdmin, load]);
  async function decide(id: string, accept: boolean) {
    setBusy(true); setError(""); setNotice("");
    try { await api.decideTransfer(id, accept); setDecision(null); setNotice(t("membership.decided")); await load(); }
    catch (err) { setError(transferErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  if (!isAdmin) return <div className="space-y-4"><h1>{t("membership.no_access_title")}</h1><p>{t("membership.transfer_admin_required")}</p><Link href="/member" className="inline-flex min-h-11 items-center rounded-md border border-input px-4">{t("membership.back")}</Link></div>;
  return <div className="mx-auto max-w-[720px] space-y-4">
    <header><h1 className="text-2xl font-semibold">{t("membership.transfer_requests")}</h1><p className="mt-2 text-sm text-muted">{t("membership.transfer_review_hint")}</p></header>
    <button disabled={busy} onClick={() => void load()} className="min-h-11 rounded-lg border border-line px-4">{t("membership.refresh")}</button>
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="text-success">{notice}</p>}
    {!requests && !error && <Loading />}
    {requests?.length === 0 && <p className="rounded-xl border border-line p-4 sm:p-6 text-muted">{t("membership.no_requests")}</p>}
    {requests?.map(request => <article key={request.id} className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <div><h2 className="font-semibold">{request.name}</h2><p className="break-all text-sm text-muted">{request.email}</p></div>
      <p className="font-medium">{request.from_name} → {request.to_name}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{request.message}</p>
      <time dateTime={request.created_at} className="block text-xs text-muted tabular-nums">{memberDate(request.created_at)}</time>
      <div className="flex gap-3"><button disabled={busy} onClick={() => { setDecision({ request, accept: true }); setError(""); }} className="min-h-11 flex-1 rounded-md border border-input px-4 font-medium disabled:opacity-50">{t("membership.approve")}</button><button disabled={busy} onClick={() => { setDecision({ request, accept: false }); setError(""); }} className="min-h-11 flex-1 rounded-md border border-input px-4 disabled:opacity-50">{t("membership.decline")}</button></div>
    </article>)}
    {decision && <Modal label={t(decision.accept ? "membership.transfer_confirm" : "membership.transfer_decline_confirm")} onClose={() => { if (!busy) setDecision(null); }}>
      <div className="space-y-4"><h2>{t(decision.accept ? "membership.transfer_confirm" : "membership.transfer_decline_confirm")}</h2><p className="font-medium">{decision.request.name}</p><p>{decision.request.from_name} → {decision.request.to_name}</p>{decision.accept && <p className="text-sm text-muted">{t("membership.transfer_confirm_hint")}</p>}
        {error && <Banner tone="error" message={error} />}
        <div className="flex flex-wrap justify-end gap-3 pt-2"><button disabled={busy} onClick={() => setDecision(null)} className="min-h-11 rounded-md border border-input px-4">{t("membership.back")}</button><button disabled={busy} aria-busy={busy} onClick={() => void decide(decision.request.id, decision.accept)} className="min-h-11 rounded-md bg-accent px-4 text-on-accent">{t(decision.accept ? "membership.approve" : "membership.decline")}</button></div>
      </div>
    </Modal>}
  </div>;
}
