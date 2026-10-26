"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, LoadingBlock, useConfirm } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";

type Request = Awaited<ReturnType<typeof api.getAdmissionRequests>>["requests"][number];

export default function AdmissionRequests() {
  const { t } = useI18n();
  const { allowed, loading } = useAccess("membership.manage");
  const errorMessage = useErrorMessage({ codes: { branch_transfer_required: "membership.branch_transfer_required" } });
  const confirm = useConfirm();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setRequests((await api.getAdmissionRequests()).requests); setError(""); }
    catch (err) { setError(errorMessage(err)); }
  }, [errorMessage]);
  useEffect(() => { if (!loading && allowed) void load(); }, [loading, allowed, load]);
  async function decide(request: Request, accept: boolean) {
    const asked = await confirm({
      title: t(accept ? "membership.approve_confirm" : "membership.decline_confirm", { name: request.name }),
      body: accept ? t("membership.approve_confirm_hint") : undefined,
      confirmLabel: t(accept ? "membership.approve" : "membership.decline"),
      tone: accept ? "default" : "danger",
    });
    if (!asked) return;
    setBusy(true); setError(""); setNotice("");
    try { await api.decideAdmissionRequest(request.id, accept); setNotice(t("membership.decided")); await load(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingBlock />;
  if (!allowed) return <p>{t("membership.no_access")}</p>;
  return <div className="mx-auto max-w-[720px] space-y-4">
    <header><h1 className="text-2xl font-semibold">{t("membership.requests")}</h1><p className="mt-2 text-sm text-muted">{t("membership.requests_hint")}</p></header>
    {error && <Banner tone="error" message={error} />}{notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}
    {!requests && (error ? <button onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button> : <LoadingBlock />)}
    {requests?.length === 0 && <p className="rounded-xl border border-line p-4 sm:p-6 text-muted">{t("membership.no_requests")}</p>}
    {requests?.map(request => <article key={request.id} className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div><h2 className="font-semibold">{request.name}</h2><p className="break-all text-sm text-muted">{request.email}</p></div>
      {request.message && <p className="whitespace-pre-wrap text-sm">{request.message}</p>}
      <div className="flex gap-3"><button disabled={busy} onClick={() => void decide(request, true)} className="min-h-11 flex-1 rounded-md border border-input px-4 font-medium text-foreground disabled:opacity-50">{t("membership.approve")}</button><button disabled={busy} onClick={() => void decide(request, false)} className="min-h-11 flex-1 rounded-lg border border-line px-4 disabled:opacity-50">{t("membership.decline")}</button></div>
    </article>)}
  </div>;
}
