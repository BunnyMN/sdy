"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, CalendarDays, CheckCircle2, RefreshCw, Users, Wallet, ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, Loading } from "@/components/ui";

import MembershipTransfers from "@/components/MembershipTransfers";

type Transfer = Awaited<ReturnType<typeof api.getMyTransfers>>["requests"][number];
type Profile = Awaited<ReturnType<typeof api.profile>>;
type Identity = Awaited<ReturnType<typeof api.getMe>>;
type Item = Awaited<ReturnType<typeof api.getMyItems>>["items"][number];
type Branch = Awaited<ReturnType<typeof api.getBranches>>["branches"][number];

export default function MemberHome() {
  const { t } = useI18n();
  const [data, setData] = useState<{ profile: Profile; me: Identity; branches: Branch[]; items: Item[]; transfers: Transfer[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const load = useCallback(async () => {
    try {
      const [profile, me, directory, feed, transfers] = await Promise.all([api.profile(), api.getMe(), api.getBranches(), api.getMyItems(), api.getMyTransfers()]);
      setData({ profile, me, transfers: transfers.requests, branches: directory.branches, items: feed.items.filter(item => item.code === "join_request") });
      setError("");
      setUpdated(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ulaanbaatar", hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } catch (err) { setError(err instanceof Error ? err.message : "—"); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await api.askToJoinBranch(slug, message.trim());
      setNotice(t("membership.sent")); setMessage(""); setSlug("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "—"); }
    finally { setBusy(false); }
  }
  async function enter(id: string) {
    setBusy(true); setError("");
    try { await api.switchTenant(id); window.location.assign("/member"); }
    catch (err) { setError(err instanceof Error ? err.message : "—"); setBusy(false); }
  }
  if (!data) return <div className="space-y-6"><h1>{t("membership.home")}</h1>{error ? <><Banner tone="error" message={t("membership.load_failed")} /><button onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button></> : <Loading />}</div>;
  const { me, profile, branches, items } = data;
  const memberships = profile.organisations.filter(org => branches.some(branch => branch.slug === org.slug));
  const canAdmit = me.is_admin || me.permissions?.includes("membership.manage");
  return <div className="mx-auto max-w-[720px] space-y-6 pb-6">
    <header className="flex items-start justify-between gap-3">
      <div><h1 className="font-semibold">{t("membership.home")}</h1><p className="mt-2 text-sm text-muted">{t("membership.welcome", { name: profile.name })}</p></div>
      <button type="button" title={t("membership.refresh")} aria-label={t("membership.refresh")} onClick={() => void load()} className="rounded-xl border border-line p-3"><RefreshCw className="h-5 w-5" /></button>
    </header>
    <p className="text-xs text-muted tabular-nums">{t("membership.updated", { time: updated })}</p>
    {error && <Banner tone="error" message={error} />}
    {notice && <p role="status" className="rounded-xl border border-success-border bg-success-soft p-4 text-success">{notice}</p>}
    {memberships.map(org => <section key={org.id} className="rounded-lg border border-line bg-surface p-4 sm:p-6">
      <p className="mb-2 flex items-center gap-2 text-xs text-muted"><Building2 className="h-4 w-4" />{t("membership.branch")}</p><h2 className="font-semibold">{org.name}</h2>
      {org.id === me.tenant_id ? <p className="mt-2 flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{t("membership.current")}</p>
        : <button disabled={busy} onClick={() => void enter(org.id)} className="mt-3 min-h-11 rounded-md border border-input px-4 text-foreground disabled:opacity-50">{t("membership.open")}</button>}
    </section>)}
    {me.workspace_kind === "organisation" && <section className="space-y-4">
      <h2>{t("membership.my_activity")}</h2>
      <div className="sdy-action-list">{[
        { href: "/module/events", label: t("membership.events"), icon: CalendarDays },
        { href: "/member/participation", label: t("events.participation"), icon: CheckCircle2 },
        { href: "/member/dues", label: t("dues.title"), icon: Wallet },
      ].map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon aria-hidden="true" /><span>{label}</span><ChevronRight aria-hidden="true" /></Link>)}</div>
      {(canAdmit || me.is_admin || me.permissions?.includes("events.manage")) && <><h2 className="pt-4">{t("membership.management")}</h2><div className="sdy-action-list">
        {canAdmit && <Link href="/member/requests"><Users aria-hidden="true" /><span>{t("membership.requests")}</span><ChevronRight aria-hidden="true" /></Link>}
        {me.is_admin && <Link href="/member/transfers"><Users aria-hidden="true" /><span>{t("membership.transfer_requests")}</span><ChevronRight aria-hidden="true" /></Link>}
        {(me.is_admin || me.permissions?.includes("events.manage")) && <Link href="/member/activity"><ChartNoAxesCombined aria-hidden="true" /><span>{t("events.activity.title")}</span><ChevronRight aria-hidden="true" /></Link>}
      </div></>}
    </section>}
    <MembershipTransfers memberships={memberships} branches={branches} requests={data.transfers} reload={load} />
    {items.length > 0 && <section className="space-y-3" aria-label={t("membership.requests")}>{items.map(item => <div key={item.id} className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-medium">{item.provider}</h2><p className="mt-1 text-sm text-muted">{t(`membership.${item.status.toLowerCase()}`)}</p>
      {item.answer && <p className="mt-2 text-sm">{item.answer}</p>}
    </div>)}</section>}
    {memberships.length === 0 && <form onSubmit={ask} className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <div><h2 className="text-lg font-semibold">{t("membership.branch_pick")}</h2><p className="mt-2 text-sm text-muted">{t("membership.branch_hint")}</p></div>
      <label className="block space-y-2"><span className="text-sm font-medium">{t("membership.branch")}</span><select required value={slug} onChange={event => setSlug(event.target.value)} className={`${fieldClass} w-full min-h-11`}>
        <option value="">{t("membership.branch_pick")}</option>
        {branches.filter(branch => !branch.parent_slug).map(parent => <optgroup key={parent.slug} label={parent.name}>
          <option value={parent.slug}>{parent.name}</option>
          {branches.filter(branch => branch.parent_slug === parent.slug).map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}
        </optgroup>)}
        {branches.filter(branch => branch.parent_slug && !branches.some(parent => parent.slug === branch.parent_slug && !parent.parent_slug)).map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}
      </select></label>
      <label className="block space-y-2"><span className="text-sm font-medium">{t("membership.message")}</span><textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={500} rows={3} className={`${fieldClass} w-full`} /></label>
      <button disabled={busy || !slug} className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">{t("membership.submit")}</button>
      {branches.length === 0 && <p className="text-sm text-muted">{t("membership.empty_branches")}</p>}
    </form>}
  </div>;
}
