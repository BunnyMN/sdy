"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { memberApi } from "@/lib/api/member";
import { useI18n } from "@/lib/i18n";
import { memberDate } from "@/lib/memberFormat";
import { Banner, Loading } from "@/components/ui";

export default function NotificationsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Awaited<ReturnType<typeof memberApi.notifications>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await memberApi.notifications()); setError(""); }
    catch { setError(t("membership.load_failed")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function mark(id?: string) {
    setBusy(true);
    try { if (id) await memberApi.read(id); else await memberApi.readAll(); await load(); }
    catch { setError(t("membership.record.save_failed")); }
    finally { setBusy(false); }
  }
  async function more() {
    if (!data) return;
    setBusy(true);
    try { const next = await memberApi.notifications(data.next_offset); setData({ ...next, items: [...data.items, ...next.items] }); }
    catch { setError(t("membership.load_failed")); }
    finally { setBusy(false); }
  }
  async function openEvent(event: React.MouseEvent<HTMLAnchorElement>, path: string) {
    const target = new URL(path, window.location.origin);
    const workspace = target.searchParams.get("workspace");
    if (!workspace || !target.pathname.startsWith("/module/events/")) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.switchTenant(workspace);
      // Reload the shell so its permissions match the newly selected branch.
      window.location.assign(target.pathname);
    } catch { setError(t("membership.load_failed")); setBusy(false); }
  }
  return <div className="mx-auto max-w-[720px] space-y-6 pb-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1>{t("membership.record.notifications")}</h1>
      {!!data?.unread && <button disabled={busy} onClick={() => void mark()} className="min-h-11 rounded-md border border-input px-4">{t("membership.record.read_all")} ({data.unread})</button>}
    </header>
    {error && <Banner tone="error" message={error} />}
    {!data && (error ? <button onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button> : <Loading />)}
    {data?.items.length === 0 && <p className="rounded-lg border border-line bg-surface p-6 text-muted">{t("membership.record.empty_notifications")}</p>}
    <ul className="space-y-3">{data?.items.map(n => <li key={n.id} className={`space-y-2 rounded-lg border bg-surface p-4 sm:p-6 ${n.read_at ? "border-line" : "border-accent"}`}>
      <div className="flex items-start justify-between gap-3"><h2 className="font-medium">{n.title}</h2>{!n.read_at && <span className="text-xs text-accent">{t("membership.record.unread")}</span>}</div>
      {n.body && <p className="break-words text-sm text-muted">{n.body}</p>}
      <p className="text-xs text-muted">{memberDate(n.created_at)}</p>
      <div className="flex flex-wrap gap-4"><Link href={n.path.startsWith("/") && !n.path.startsWith("//") ? n.path : "/member"} onClick={e => { void openEvent(e, n.path); }} className="inline-flex min-h-11 items-center text-accent underline">{t("membership.record.open")}</Link>
        {!n.read_at && <button disabled={busy} onClick={() => void mark(n.id)} className="min-h-11 text-sm">{t("membership.record.read")}</button>}
      </div>
    </li>)}</ul>
    {data?.has_more && <button disabled={busy} onClick={() => void more()} className="min-h-11 rounded-md border border-input px-4">{t("membership.record.more")}</button>}
  </div>;
}
