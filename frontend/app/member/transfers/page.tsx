"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading } from "@/components/ui";
import { transferErrorMessage } from "@/components/MembershipTransfers";

type Request = Awaited<ReturnType<typeof api.getTransferRequests>>["requests"][number];

export default function TransferRequests() {
  const { t } = useI18n();
  const { isAdmin, loading } = useAccess();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setRequests((await api.getTransferRequests()).requests); setError(""); }
    catch (err) { setError(transferErrorMessage(err, t)); }
  }, [t]);
  useEffect(() => { if (!loading && isAdmin) void load(); }, [loading, isAdmin, load]);
  async function decide(id: string, accept: boolean) {
    setBusy(true); setError(""); setNotice("");
    try { await api.decideTransfer(id, accept); setNotice(t("membership.decided")); await load(); }
    catch (err) { setError(transferErrorMessage(err, t)); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  if (!isAdmin) return <p>{t("membership.transfer_admin_required")}</p>;
  return <div className="mx-auto max-w-3xl space-y-4">
    <header><h1 className="text-2xl font-semibold">{t("membership.transfer_requests")}</h1><p className="mt-2 text-sm text-muted">{t("membership.transfer_review_hint")}</p></header>
    <button disabled={busy} onClick={() => void load()} className="min-h-11 rounded-lg border border-line px-4">{t("membership.refresh")}</button>
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="text-accent">{notice}</p>}
    {!requests && !error && <Loading />}
    {requests?.length === 0 && <p className="rounded-xl border border-line p-5 text-muted">{t("membership.no_requests")}</p>}
    {requests?.map(request => <article key={request.id} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div><h2 className="font-semibold">{request.name}</h2><p className="break-all text-sm text-muted">{request.email}</p></div>
      <p className="font-medium">{request.from_name} → {request.to_name}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{request.message}</p>
      <div className="flex gap-3"><button disabled={busy} onClick={() => void decide(request.id, true)} className="min-h-11 flex-1 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("membership.approve")}</button><button disabled={busy} onClick={() => void decide(request.id, false)} className="min-h-11 flex-1 rounded-lg border border-line px-4 disabled:opacity-50">{t("membership.decline")}</button></div>
    </article>)}
  </div>;
}
