"use client";

import { useCallback, useEffect, useState } from "react";
import { sanctionsApi, type Sanction } from "@/lib/api/events";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, LoadingBlock, useConfirm } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { memberDate } from "@/lib/memberFormat";

type Member = { user_id: string; name: string; email: string };

// The control committee's screen (events 1.5.0): record a warning, perhaps
// with points deducted, and read the branch's decisions.
export default function SanctionsPage() {
  const { t } = useI18n();
  const { allowed, loading } = useAccess("events.discipline");
  const errorMessage = useErrorMessage({ fallback: "sanctions.failed" });
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [list, setList] = useState<{ sanctions: Sanction[]; has_more: boolean; next_offset: number } | null>(null);
  const [user, setUser] = useState("");
  const [points, setPoints] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [people, decisions] = await Promise.all([sanctionsApi.members(), sanctionsApi.list()]);
      setMembers([...people.members].sort((a, b) => a.name.localeCompare(b.name)));
      setList(decisions);
      setError("");
    } catch (err) { setError(errorMessage(err)); }
  }, [errorMessage]);
  useEffect(() => { if (!loading && allowed) void load(); }, [loading, allowed, load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const target = members?.find(m => m.user_id === user);
    const deduct = Math.max(0, Math.floor(Number(points) || 0));
    if (!target || !reason.trim()) return;
    const ok = await confirm({
      title: deduct > 0 ? t("sanctions.confirm", { name: target.name, points: deduct }) : t("sanctions.confirm_warning", { name: target.name }),
      body: reason.trim(),
      confirmLabel: t("sanctions.submit"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await sanctionsApi.create({ user_id: target.user_id, points: deduct, reason: reason.trim() });
      setNotice(t("sanctions.saved")); setUser(""); setPoints("0"); setReason("");
      setList(await sanctionsApi.list());
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  async function more() {
    if (!list) return;
    setBusy(true);
    try {
      const next = await sanctionsApi.list(list.next_offset);
      setList({ ...next, sanctions: [...list.sanctions, ...next.sanctions] });
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  if (loading) return <LoadingBlock />;
  if (!allowed) return <p>{t("sanctions.no_access")}</p>;
  return <div className="mx-auto max-w-[720px] space-y-5 pb-6">
    <header><h1>{t("sanctions.title")}</h1><p className="mt-2 text-sm text-muted">{t("sanctions.hint")}</p></header>
    {error && <Banner tone="error" message={error} />}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {!members && !error && <LoadingBlock />}
    {members && <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6" aria-labelledby="new-sanction">
      <h2 id="new-sanction" className="font-medium">{t("sanctions.new")}</h2>
      <label className="block space-y-2"><span>{t("sanctions.member")}</span>
        <select required value={user} onChange={e => setUser(e.target.value)} className={`${fieldClass} min-h-11 w-full`}>
          <option value="">{t("sanctions.choose_member")}</option>
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}
        </select></label>
      <label className="block space-y-2"><span>{t("sanctions.points")}</span>
        <input type="number" min={0} max={10000} step={1} required value={points} onChange={e => setPoints(e.target.value)} className={`${fieldClass} min-h-11 w-32`} /></label>
      <label className="block space-y-2"><span>{t("sanctions.reason")}</span>
        <textarea required maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} className={`${fieldClass} w-full`} /></label>
      <button disabled={busy || !user || !reason.trim()} className="min-h-11 rounded-md bg-accent px-5 text-on-accent disabled:opacity-50">{t("sanctions.submit")}</button>
    </form>}
    {list && <section className="space-y-3" aria-labelledby="sanction-history">
      <h2 id="sanction-history" className="font-medium">{t("sanctions.history")}</h2>
      {list.sanctions.length === 0 && <p className="text-muted">{t("sanctions.empty")}</p>}
      <ul className="space-y-3">{list.sanctions.map(s => <li key={s.id} className="space-y-1 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{s.user_name || "—"}</span>
          <span className={s.points > 0 ? "font-semibold text-danger" : "text-muted"}>{s.points > 0 ? t("sanctions.deducted", { points: s.points }) : t("sanctions.warning")}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm">{s.reason}</p>
        <p className="text-xs text-muted">{memberDate(s.created_at)} · {t("sanctions.by", { name: s.actor_name || "—" })}{s.event_title && ` · ${s.event_title}`}</p>
      </li>)}</ul>
      {list.has_more && <button disabled={busy} onClick={() => void more()} className="min-h-11 rounded-md border border-input px-4">{t("sanctions.more")}</button>}
    </section>}
  </div>;
}
