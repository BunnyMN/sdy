"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Bell, Building2, CalendarDays, ChartNoAxesCombined, CheckCircle2, Settings, Users, Wallet, WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brandContext";
import type { api } from "@/lib/api";
import UserMenu from "@/components/UserMenu";
import "./member.css";

type Identity = Awaited<ReturnType<typeof api.getMe>>;

export default function MemberShell({ user, onLogout, children }: { user: Identity; onLogout: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const brand = useBrand();
  const pathname = usePathname();
  const main = useRef<HTMLElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [offline, setOffline] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const company = user.workspace_kind === "organisation";
  const can = (permission: string) => user.is_admin || user.permissions?.includes(permission);
  const navigation = [
    { href: "/member", label: t("membership.nav_home"), icon: Building2, active: pathname === "/member" },
    ...(company ? [
      { href: "/module/events", label: t("membership.nav_events"), icon: CalendarDays, active: pathname.startsWith("/module/events") },
      { href: "/member/participation", label: t("membership.nav_attendance"), icon: CheckCircle2, active: ["/member/participation", "/member/check-in"].includes(pathname) },
      { href: "/member/dues", label: t("dues.nav"), icon: Wallet, active: ["/member/dues", "/member/finance"].includes(pathname) },
    ] : []),
    { href: "/member/record", label: t("membership.nav_profile"), icon: Users, active: pathname === "/member/record" || pathname === "/profile" },
  ];
  const staff = company ? [
    ...(can("membership.manage") ? [
      { href: "/member/overview", label: t("membership.record.overview"), icon: ChartNoAxesCombined },
      { href: "/member/members", label: t("membership.record.members"), icon: Users },
      { href: "/member/requests", label: t("membership.requests"), icon: Users },
    ] : []),
    ...(user.is_admin ? [{ href: "/member/transfers", label: t("membership.transfer_requests"), icon: ArrowRightLeft }] : []),
    ...(can("events.manage") ? [{ href: "/member/activity", label: t("events.activity.title"), icon: ChartNoAxesCombined }] : []),
    ...(can("membership.finance") ? [{ href: "/member/finance", label: t("dues.finance"), icon: Wallet }] : []),
    ...(user.is_admin ? [{ href: "/settings/access", label: t("access.view.title"), icon: Settings }] : []),
  ] : [];
  const back = pathname.startsWith("/module/events/") ? "/module/events" : "/member";

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setKeyboard(!!viewport && window.innerHeight - viewport.height > 150 && !!document.activeElement?.matches("input,select,textarea"));
    viewport?.addEventListener("resize", update); document.addEventListener("focusout", update);
    return () => { viewport?.removeEventListener("resize", update); document.removeEventListener("focusout", update); };
  }, []);
  useEffect(() => {
    const region = main.current;
    if (!region) return;
    let focused = false;
    const update = () => {
      const heading = region.querySelector("h1");
      if (!heading || focused) return;
      focused = true;
      const title = heading.textContent || "";
      document.title = `${title} — ${brand.name}`;
      heading.tabIndex = -1; heading.focus({ preventScroll: true });
      setAnnouncement(t("membership.page_loaded", { title }));
    };
    update(); const observer = new MutationObserver(update); observer.observe(region, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, brand.name, t]);

  return <div className="sdy-member-shell">
    <a className="sdy-skip" href="#member-main">{t("membership.skip_content")}</a>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    <header className="sdy-member-header">
      <Link href="/member" className="sdy-member-brand" aria-label={brand.name}>
        {/* Deployment-owned logo; its URL can change independently of a build. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoUrl} width={32} height={32} alt="" />
        <span><strong>{brand.name}</strong><small>{t("membership.home")}</small></span>
      </Link>
      <p className="sdy-header-organisation" title={user.tenant_name}><Building2 aria-hidden="true" /><span>{company ? user.tenant_name : t("membership.branch_pick")}</span></p>
      <Link href="/member/notifications" aria-label={t("membership.record.notifications")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md"><Bell className="h-5 w-5" aria-hidden="true" /></Link>
      <UserMenu user={user} onLogout={onLogout} />
    </header>
    {offline && <p role="status" className="sdy-offline"><WifiOff aria-hidden="true" />{t("membership.offline")}</p>}
    <div className="sdy-member-layout">
      <aside className="sdy-member-sidebar">
        <p className="sdy-nav-caption">{t("membership.home")}</p>
        <nav aria-label={t("membership.home")}>{navigation.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>)}</nav>
        {staff.length > 0 && <><p className="sdy-nav-caption">{t("membership.management")}</p><nav aria-label={t("membership.management")}>{staff.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>)}</nav></>}
        <Link href="/settings/appearance" className="sdy-appearance"><Settings aria-hidden="true" />{t("web.menu.appearance")}</Link>
      </aside>
      <main id="member-main" ref={main} className="sdy-member-main" tabIndex={-1}>
        <div className="sdy-member-context"><span><Building2 aria-hidden="true" />{company ? user.tenant_name : t("membership.branch_pick")}</span>{pathname !== "/member" && <Link href={back}><ArrowLeft aria-hidden="true" />{t("membership.back")}</Link>}</div>
        {children}
      </main>
    </div>
    <nav className="sdy-member-tabs" aria-label={t("web.label.apps")} hidden={keyboard}>{navigation.map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link>)}</nav>
  </div>;
}
