"use client";

import { useCallback, useEffect, useState } from "react";
import { participationApi } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Banner, LoadingBlock } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { memberDate } from "@/lib/memberFormat";

type Blocked = { user_id: string; name: string; blocked_at: string };

// Members blocked in the discussion, with a way back (as on iOS: Профайл →
// Блоклосон гишүүд).
export default function BlockedMembersPage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [list, setList] = useState<Blocked[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { setList((await participationApi.blocks()).blocked ?? []); setError(""); }
    catch (err) { setError(errorMessage(err)); }
  }, [errorMessage]);
  useEffect(() => { void load(); }, [load]);
  async function unblock(user: Blocked) {
    setBusy(user.user_id); setError("");
    try { await participationApi.unblock(user.user_id); setList(l => (l ?? []).filter(x => x.user_id !== user.user_id)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(""); }
  }
  return <div className="mx-auto max-w-[720px] space-y-5 pb-6">
    <header><h1>{t("events.blocked.title")}</h1><p className="mt-2 text-sm text-muted">{t("events.blocked.hint")}</p></header>
    {error && <Banner tone="error" message={error} />}
    {!list && !error && <LoadingBlock />}
    {list?.length === 0 && <p className="text-muted">{t("events.blocked.empty")}</p>}
    <ul className="space-y-3">{list?.map(user => <li key={user.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
      <span><strong className="block">{user.name || "—"}</strong><small className="text-muted">{memberDate(user.blocked_at)}</small></span>
      <button disabled={!!busy} onClick={() => void unblock(user)} className="min-h-11 rounded-md border border-input px-4 disabled:opacity-50">{t("events.blocked.unblock")}</button>
    </li>)}</ul>
  </div>;
}
