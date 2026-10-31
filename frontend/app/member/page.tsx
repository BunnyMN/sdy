"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Building2, CalendarDays, CheckCircle2, ClipboardList, RefreshCw, Users, Vote, Wallet, ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { memberApi, type MemberRecord } from "@/lib/api/member";
import { duesApi, type MyDuesPage } from "@/lib/api/dues";
import { eventsApi, participationApi, type EventRecord } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { ApiError } from "@/lib/errorMessage";
import { dayOf, formatMoment } from "@/lib/datetime";
import { isOverdue, reportable } from "@/lib/duesProgress";
import { memberMoney } from "@/lib/memberFormat";
import { Badge, Banner, ErrorNote, fieldClass, LoadingBlock } from "@/components/ui";

import MembershipTransfers from "@/components/MembershipTransfers";

type Transfer = Awaited<ReturnType<typeof api.getMyTransfers>>["requests"][number];
type Profile = Awaited<ReturnType<typeof api.profile>>;
type Identity = Awaited<ReturnType<typeof api.getMe>>;
type Item = Awaited<ReturnType<typeof api.getMyItems>>["items"][number];
type Branch = Awaited<ReturnType<typeof api.getBranches>>["branches"][number];

/** One part of "what is waiting for you": its answer, or that it could not be asked. */
type Part<T> = { data?: T; failed?: boolean };
type NextEvent = { event: EventRecord | null; motions: number; offers: number };
type Todo = { dues: Part<MyDuesPage>; event: Part<NextEvent>; unread: Part<number> };

const JOIN_CODES = { branch_transfer_required: "membership.branch_transfer_required" };

const settled = <T,>(result: PromiseSettledResult<T>): Part<T> =>
  result.status === "fulfilled" ? { data: result.value } : { failed: true };

// Dues and events sit behind an installed app and a permission. A branch
// without the app, or a role without the permission, is answered 403/404:
// that row does not apply here, it has not failed to load.
const optional = <T,>(result: PromiseSettledResult<T>): Part<T> =>
  result.status === "rejected" && result.reason instanceof ApiError && (result.reason.status === 403 || result.reason.status === 404)
    ? {} : settled(result);

/** The member's next registered event, and what in it is waiting on them. */
async function nextEvent(): Promise<NextEvent> {
  const { events } = await eventsApi.list("planned");
  const now = Date.now();
  const event = (events ?? [])
    .filter(e => e.my_status === "registered" && new Date(e.starts_at).getTime() >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
  if (!event) return { event: null, motions: 0, offers: 0 };
  // Optional extras: a failure here should not hide the event itself.
  const [motions, tasks] = await Promise.allSettled([participationApi.motions(event.id), participationApi.tasks(event.id)]);
  const open = motions.status === "fulfilled" && motions.value.can_vote && motions.value.signing_ready
    ? (motions.value.motions ?? []).filter(m => m.status === "voting" && m.my_vote?.status !== "signed").length : 0;
  const offers = tasks.status === "fulfilled"
    ? (tasks.value.tasks ?? []).filter(task => task.assignments.some(a => a.user_id === tasks.value.me && a.status === "offered")).length : 0;
  return { event, motions: open, offers };
}

export default function MemberHome() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage({ codes: JOIN_CODES });
  const [data, setData] = useState<{ profile: Profile; me: Identity; branches: Branch[]; items: Item[]; transfers: Transfer[]; record: MemberRecord } | null>(null);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState("");
  // focus and visibilitychange both fire when a tab comes back; one load is enough.
  const inFlight = useRef<Promise<void> | null>(null);
  const lastLoad = useRef(0);

  const loadTodo = useCallback(async (organisation: boolean) => {
    if (!organisation) {
      const [unread] = await Promise.allSettled([memberApi.notifications().then(n => n.unread ?? 0)]);
      setTodo({ dues: {}, event: {}, unread: settled(unread) });
      return;
    }
    const [dues, event, unread] = await Promise.allSettled([duesApi.mine(), nextEvent(), memberApi.notifications().then(n => n.unread ?? 0)]);
    setTodo({ dues: optional(dues), event: optional(event), unread: settled(unread) });
  }, []);

  const load = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setRefreshing(true);
      const [profile, me, directory, record, feed, transfers] = await Promise.allSettled([
        api.profile(), api.getMe(), api.getBranches(), memberApi.record(), api.getMyItems(), api.getMyTransfers(),
      ]);
      if (profile.status === "fulfilled" && me.status === "fulfilled" && directory.status === "fulfilled" && record.status === "fulfilled") {
        setData(previous => ({
          profile: profile.value, me: me.value, record: record.value, branches: directory.value.branches,
          // The secondary lists keep their last answer when only they fail.
          transfers: transfers.status === "fulfilled" ? transfers.value.requests : previous?.transfers ?? [],
          items: feed.status === "fulfilled" ? feed.value.items.filter(item => item.code === "join_request") : previous?.items ?? [],
        }));
        setLoadFailed(false); setRefreshFailed(false);
        setUpdated(formatMoment(new Date()).slice(11));
        await loadTodo(me.value.workspace_kind === "organisation");
      } else {
        setLoadFailed(true); setRefreshFailed(true);
      }
      lastLoad.current = Date.now();
    })().finally(() => { inFlight.current = null; setRefreshing(false); });
    inFlight.current = run;
    return run;
  }, [loadTodo]);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastLoad.current < 5000) return;
      void load();
    };
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
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function enter(id: string) {
    setBusy(true); setError("");
    try { await api.switchTenant(id); window.location.assign("/member"); }
    catch (err) { setError(errorMessage(err)); setBusy(false); }
  }
  const retry = <button type="button" disabled={refreshing} onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4 disabled:opacity-50">{t("membership.retry")}</button>;
  if (!data) return <div className="space-y-6"><h1>{t("membership.home")}</h1>{loadFailed ? <><Banner tone="error" message={t("membership.load_failed")} />{retry}</> : <LoadingBlock />}</div>;
  const { me, profile, branches, items } = data;
  const workspaces = profile.organisations.filter(org => branches.some(branch => branch.slug === org.slug));
  const memberships = workspaces.filter(org => data.record.memberships.some(m => m.tenant_id === org.id && m.is_primary && m.status === "active"));
  const hasPrimary = data.record.memberships.some(m => m.is_primary);
  const canAdmit = me.is_admin || me.permissions?.includes("membership.manage");
  const organisation = me.workspace_kind === "organisation";
  return <div className="mx-auto max-w-[720px] space-y-6 pb-6">
    <header className="flex items-start justify-between gap-3">
      <div><h1 className="font-semibold">{t("membership.home")}</h1><p className="mt-2 text-sm text-muted">{t("membership.welcome", { name: profile.name })}</p></div>
      <button type="button" title={t("membership.refresh")} aria-label={refreshing ? t("membership.refreshing") : t("membership.refresh")} aria-busy={refreshing || undefined} disabled={refreshing} onClick={() => void load()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-5 w-5${refreshing ? " animate-spin" : ""}`} /></button>
    </header>
    <p className="text-xs text-muted tabular-nums">{t("membership.updated", { time: updated })}</p>
    {refreshFailed && <Banner tone="error" message={t("membership.refresh_failed")} onDismiss={() => setRefreshFailed(false)} />}
    {error && <Banner tone="error" message={error} onDismiss={() => setError("")} />}
    {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}

    <TodoSection todo={todo} organisation={organisation} retry={() => void load()} refreshing={refreshing} />

    {workspaces.length > 0 && <section aria-labelledby="member-branches" className="space-y-3">
      <h2 id="member-branches">{t("membership.organisations")}</h2>
      <div className="sdy-org-grid">{workspaces.map(org => <section key={org.id} className={`rounded-lg border border-line bg-surface p-4 sm:p-6${org.id === me.tenant_id ? " sdy-org-current" : ""}`}>
        <p className="mb-2 flex items-center gap-2 text-xs text-muted"><Building2 aria-hidden="true" className="h-4 w-4" />{t(data.record.memberships.some(m => m.tenant_id === org.id && m.is_primary) ? "membership.record.primary" : "membership.record.other_access")}</p><h3 className="font-semibold">{org.name}</h3>
        {org.id === me.tenant_id ? <p className="mt-2 flex items-center gap-2 text-sm text-success"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />{t("membership.current")}</p>
          : <button disabled={busy} onClick={() => void enter(org.id)} className="sdy-org-enter mt-3 min-h-11 rounded-md border border-input px-4 text-foreground disabled:opacity-50">{t("membership.open")}</button>}
      </section>)}</div>
    </section>}
    {organisation && <section className="space-y-4">
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
    <div className="sdy-action-list"><Link href="/member/record"><Users aria-hidden="true" /><span>{t("membership.record.title")}</span><ChevronRight aria-hidden="true" /></Link><Link href="/member/notifications"><Bell aria-hidden="true" /><span>{t("membership.record.notifications")}</span><ChevronRight aria-hidden="true" /></Link>{canAdmit && <Link href="/member/overview"><ChartNoAxesCombined aria-hidden="true" /><span>{t("membership.record.overview")}</span><ChevronRight aria-hidden="true" /></Link>}</div>
    <MembershipTransfers memberships={memberships} branches={branches} requests={data.transfers} reload={load} />
    {items.length > 0 && <section className="space-y-3" aria-label={t("membership.requests")}>{items.map(item => <div key={item.id} className="rounded-xl border border-line bg-surface p-4">
      <h2 className="font-medium">{item.provider}</h2><p className="mt-1 text-sm text-muted">{t(`membership.${item.status.toLowerCase()}`)}</p>
      {item.answer && <p className="mt-2 text-sm">{item.answer}</p>}
    </div>)}</section>}
    {!hasPrimary && <form onSubmit={ask} className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
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

/**
 * What is waiting on the member, above everything else: money owed, the next
 * event they are going to, a vote or a task in it, unread notifications. Each
 * part is asked separately, so one that fails says so in its own row and the
 * rest still show.
 */
function TodoSection({ todo, organisation, retry, refreshing }: { todo: Todo | null; organisation: boolean; retry: () => void; refreshing: boolean }) {
  const { t } = useI18n();
  const row = "flex min-h-11 items-center gap-3 px-4 py-3";
  const failed = (key: string, label: string) => <li key={key} className={`${row} flex-wrap`}><ErrorNote className="flex-1">{label}: {t("membership.todo.section_failed")}</ErrorNote>
    <button type="button" disabled={refreshing} onClick={retry} className="min-h-11 rounded-md border border-input px-4 text-sm disabled:opacity-50">{t("membership.retry")}</button></li>;
  if (!todo) return <section aria-labelledby="member-todo" className="space-y-3"><h2 id="member-todo">{t("membership.todo.title")}</h2><LoadingBlock rows={3} /></section>;

  const rows: React.ReactNode[] = [];
  if (organisation) {
    const dues = todo.dues;
    if (dues.failed) rows.push(failed("dues", t("dues.title")));
    else if (dues.data) {
      const today = dayOf();
      const open = (dues.data.charges ?? []).filter(charge => !charge.waived && charge.balance > 0);
      const outstanding = dues.data.totals?.outstanding ?? open.reduce((sum, charge) => sum + charge.balance, 0);
      const overdue = open.filter(charge => isOverdue(charge, today)).length;
      const toReport = open.some(charge => reportable(charge) > 0);
      if (outstanding > 0) rows.push(<li key="dues" className={`${row} flex-wrap`}>
        <Wallet aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <strong className="block tabular-nums">{t("membership.todo.dues_outstanding", { amount: memberMoney(outstanding) })}</strong>
          {overdue > 0 ? <Badge tone="danger">{t("membership.todo.dues_overdue", { count: overdue })}</Badge>
            : !toReport && <span className="text-xs text-muted">{t("dues.awaiting_all")}</span>}
        </span>
        <Link href="/member/dues" className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${toReport ? "bg-accent text-on-accent" : "border border-input"}`}>{toReport ? t("dues.report") : t("dues.title")}</Link>
      </li>);
    }
    const next = todo.event;
    if (next.failed) rows.push(failed("event", t("membership.todo.next_event")));
    else if (next.data?.event) {
      const { event, motions, offers } = next.data;
      rows.push(<li key="event"><Link href={`/module/events/${event.id}`} className={`${row} hover:bg-surface-2`}>
        <CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1"><span className="block text-xs text-muted">{t("membership.todo.next_event")}</span>
          <strong className="block truncate">{event.title}</strong>
          <span className="block text-xs text-muted tabular-nums">{formatMoment(event.starts_at)}{event.location ? ` · ${event.location}` : ""}</span></span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
      </Link></li>);
      if (motions > 0) rows.push(<li key="motions"><Link href={`/module/events/${event.id}#discussion`} className={`${row} hover:bg-surface-2`}>
        <Vote aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" /><span className="flex-1">{t("membership.todo.open_motions", { count: motions })}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-muted" /></Link></li>);
      if (offers > 0) rows.push(<li key="offers"><Link href={`/module/events/${event.id}#tasks`} className={`${row} hover:bg-surface-2`}>
        <ClipboardList aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" /><span className="flex-1">{t("membership.todo.task_offers", { count: offers })}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-muted" /></Link></li>);
    } else if (next.data) rows.push(<li key="event" className={`${row} flex-wrap`}>
      <CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 text-sm text-muted">{t("membership.todo.no_event")}</span>
      <Link href="/module/events" className="inline-flex min-h-11 items-center text-sm text-accent underline">{t("membership.todo.browse_events")}</Link>
    </li>);
  }
  if (todo.unread.failed) rows.push(failed("unread", t("membership.record.notifications")));
  else if (todo.unread.data) rows.push(<li key="unread"><Link href="/member/notifications" className={`${row} hover:bg-surface-2`}>
    <Bell aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" /><span className="flex-1">{t("membership.todo.unread", { count: todo.unread.data })}</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-muted" /></Link></li>);

  return <section aria-labelledby="member-todo" className="space-y-3">
    <h2 id="member-todo">{t("membership.todo.title")}</h2>
    {rows.length === 0 ? <p className="flex items-center gap-2 rounded-lg border border-line bg-surface p-4 text-sm text-muted"><CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success" />{t("membership.todo.nothing")}</p>
      : <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">{rows}</ul>}
  </section>;
}
