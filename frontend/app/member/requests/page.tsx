"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading } from "@/components/ui";

type Request = Awaited<ReturnType<typeof api.getAdmissionRequests>>["requests"][number];

export default function AdmissionRequests() {
  const { t } = useI18n();
  const { allowed, loading } = useAccess("membership.manage");
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setRequests((await api.getAdmissionRequests()).requests); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "—"); }
  }, []);
  useEffect(() => { if (!loading && allowed) void load(); }, [loading, allowed, load]);
  async function decide(id: string, accept: boolean) {
    setBusy(true); setError(""); setNotice("");
    try { await api.decideAdmissionRequest(id, accept); setNotice(t("membership.decided")); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  if (!allowed) return <p>{t("membership.no_access")}</p>;
  return <div className="mx-auto max-w-3xl space-y-4">
    <header><h1 className="text-2xl font-semibold">{t("membership.requests")}</h1><p className="mt-2 text-sm text-muted">{t("membership.requests_hint")}</p></header>
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="text-accent">{notice}</p>}
    {!requests && !error && <Loading />}
    {requests?.length === 0 && <p className="rounded-xl border border-line p-5 text-muted">{t("membership.no_requests")}</p>}
    {requests?.map(request => <article key={request.id} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div><h2 className="font-semibold">{request.name}</h2><p className="break-all text-sm text-muted">{request.email}</p></div>
      {request.message && <p className="whitespace-pre-wrap text-sm">{request.message}</p>}
      <div className="flex gap-3"><button disabled={busy} onClick={() => void decide(request.id, true)} className="min-h-11 flex-1 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("membership.approve")}</button><button disabled={busy} onClick={() => void decide(request.id, false)} className="min-h-11 flex-1 rounded-lg border border-line px-4 disabled:opacity-50">{t("membership.decline")}</button></div>
    </article>)}
  </div>;
}
