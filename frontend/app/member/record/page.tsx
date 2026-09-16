"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { memberApi, type MemberRecord, type MemberProfile } from "@/lib/api/member";
import { useI18n } from "@/lib/i18n";
import { memberDate } from "@/lib/memberFormat";
import { Banner, fieldClass, Loading } from "@/components/ui";

export default function MemberRecordPage() {
  const { t } = useI18n();
  const [data, setData] = useState<MemberRecord | null>(null);
  const [profile, setProfile] = useState<MemberProfile>({ phone: "", residence: "", notifications_enabled: true });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const result = await memberApi.record(); setData(result); setProfile(result.profile); setError(""); }
    catch { setError(t("membership.load_failed")); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setSaved(false); setError("");
    try { setProfile(await memberApi.save(profile)); setSaved(true); }
    catch { setError(t("membership.record.save_failed")); }
    finally { setBusy(false); }
  }
  async function more() {
    if (!data) return;
    setBusy(true);
    try { const next = await memberApi.record(data.next_offset); setData({ ...next, history: [...data.history, ...next.history] }); }
    catch { setError(t("membership.load_failed")); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-[720px] space-y-6 pb-6">
    <h1 className="font-semibold">{t("membership.record.title")}</h1>
    <Link href="/member/history" className="inline-flex min-h-11 items-center text-accent underline">{t("membership.record.personal_history")}</Link>
    {error && <Banner tone="error" message={error} />}
    {!data && (error ? <button onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button> : <Loading />)}
    {data && <>
      <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <h2>{t("membership.record.affiliations")}</h2>
        {!data.memberships.some(m => m.is_primary) && <p className="text-sm text-muted">{t("membership.record.no_primary")}</p>}
        {data.memberships.map(m => <div key={m.tenant_id} className="space-y-1 border-b border-line pb-3 last:border-0">
          <h3 className="font-medium">{m.name}</h3>
          <p className="text-sm">{m.is_primary ? t("membership.record.primary") : t("membership.record.other_access")} · {t(`membership.record.status.${m.status}`)}</p>
          {m.member_since && <p className="text-sm text-muted">{t("membership.record.joined")}: {memberDate(m.member_since)}</p>}
        </div>)}
        <Link href="/member" className="inline-flex min-h-11 items-center text-accent underline">{t("membership.transfer_title")}</Link>
      </section>
      <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <h2>{t("membership.record.contact")}</h2>
        <p className="text-sm text-muted">{t("membership.record.contact_hint")}</p>
        <label className="block space-y-2"><span>{t("membership.record.phone")}</span><input type="tel" autoComplete="tel" maxLength={32} value={profile.phone} onChange={e => { setProfile({ ...profile, phone: e.target.value }); setSaved(false); }} className={`${fieldClass} w-full min-h-11`} /></label>
        <label className="block space-y-2"><span>{t("membership.record.residence")}</span><input autoComplete="address-level2" maxLength={200} value={profile.residence} onChange={e => { setProfile({ ...profile, residence: e.target.value }); setSaved(false); }} className={`${fieldClass} w-full min-h-11`} /></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={profile.notifications_enabled} onChange={e => { setProfile({ ...profile, notifications_enabled: e.target.checked }); setSaved(false); }} />{t("membership.record.notifications_enabled")}</label>
        {saved && <p role="status" className="text-success">{t("dues.saved")}</p>}
        <button disabled={busy} className="min-h-11 rounded-md bg-accent px-5 font-medium text-on-accent disabled:opacity-50">{t("dues.save")}</button>
        <Link href="/profile" className="ml-4 inline-flex min-h-11 items-center text-accent underline">{t("membership.record.identity")}</Link>
      </form>
      <section className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <h2>{t("membership.record.history")}</h2>
        {data.history.length === 0 && <p className="text-sm text-muted">{t("membership.record.empty_history")}</p>}
        <ol className="space-y-4">{data.history.map(h => <li key={h.id} className="border-l-2 border-line pl-4">
          <p className="font-medium">{h.branch} · {t(`membership.record.status.${h.status}`)}</p>
          <p className="text-sm text-muted">{memberDate(h.created_at)}</p>
          <p className="mt-1 break-words text-sm">{h.reason}</p>
        </li>)}</ol>
        {data.has_more && <button disabled={busy} onClick={() => void more()} className="min-h-11 rounded-md border border-input px-4">{t("membership.record.more")}</button>}
      </section>
    </>}
  </div>;
}
