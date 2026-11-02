"use client";

import { useCallback, useEffect, useState } from "react";
import { MEMBER_POSITIONS, memberApi, type ManagedMember, type MemberPosition, type MemberStatus, type PositionPolicy } from "@/lib/api/member";
import { useAccess } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Banner, fieldClass, LoadingBlock, Modal } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { memberDate } from "@/lib/memberFormat";

// Module-level: a fresh object each render would give useErrorMessage a new
// callback each render, and the load effect that depends on it would loop.
const ADMIN_CODES = {
  branch_transfer_required: "membership.branch_transfer_required",
  membership_self_decision_forbidden: "membership.self_decision_forbidden",
  join_request_self_decision_forbidden: "membership.self_decision_forbidden",
  position_chair_required: "membership.position.error.chair_required",
  position_chair_admin_only: "membership.position.error.chair_admin_only",
  position_chair_taken: "membership.position.error.chair_taken",
  position_needs_active_member: "membership.position.error.needs_active",
  auditor_seats_full: "membership.position.error.seats_full",
  auditor_seats_below_current: "membership.position.error.seats_below",
  auditor_seats_invalid: "membership.position.error.seats_invalid",
} as const;

export default function MembersPage() {
  const { t } = useI18n();
  const { allowed, loading, isAdmin } = useAccess("membership.manage");
  const statusError = useErrorMessage({ codes: ADMIN_CODES, fallback: "membership.record.status_failed" });
  const positionError = useErrorMessage({ codes: ADMIN_CODES, fallback: "membership.position.failed" });
  const [data, setData] = useState<Awaited<ReturnType<typeof memberApi.members>> | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ManagedMember | null>(null);
  const [status, setStatus] = useState<MemberStatus>("active");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<PositionPolicy | null>(null);
  const [seats, setSeats] = useState("");
  const load = useCallback(async () => {
    try {
      const [members, rules] = await Promise.all([memberApi.members(query), memberApi.positions()]);
      setData(members); setPolicy(rules); setSeats(String(rules.auditor_seats)); setError("");
    }
    catch { setError(t("membership.load_failed")); }
  }, [query, t]);
  useEffect(() => { if (allowed && !loading) void load(); }, [allowed, loading, load]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    try { await memberApi.status(editing.user_id, status, reason.trim()); setEditing(null); setNotice(t("dues.saved")); await load(); }
    catch (err) { setError(statusError(err)); }
    finally { setBusy(false); }
  }
  async function setPosition(member: ManagedMember, position: MemberPosition) {
    setBusy(true); setError(""); setNotice("");
    try { await memberApi.position(member.user_id, position); setNotice(t("membership.position.saved")); await load(); }
    catch (err) { setError(positionError(err)); }
    finally { setBusy(false); }
  }
  async function saveSeats(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try { await memberApi.auditorSeats(Number(seats)); setNotice(t("membership.position.seats_saved")); await load(); }
    catch (err) { setError(positionError(err)); }
    finally { setBusy(false); }
  }
  async function more() {
    if (!data) return; setBusy(true);
    try { const next = await memberApi.members(query, data.next_offset); setData({ ...next, members: [...data.members, ...next.members] }); }
    catch { setError(t("membership.load_failed")); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingBlock />;
  if (!allowed) return <p>{t("membership.no_access")}</p>;
  const transitions: MemberStatus[] = editing?.status === "none" ? ["active"] : editing?.is_primary ? ["active", "suspended", "expired", "left", "alumni"] : ["active", "left", "alumni"];
  return <div className="mx-auto max-w-[720px] space-y-5 pb-6">
    <header><h1>{t("membership.record.members")}</h1><p className="mt-2 text-sm text-muted">{t("membership.record.staff_hint")}</p></header>
    <form onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }} className="flex gap-2"><label className="flex-1"><span className="sr-only">{t("membership.record.search")}</span><input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder={t("membership.record.search")} className={`${fieldClass} min-h-11 w-full`} /></label><button className="min-h-11 rounded-md border border-input px-4">{t("membership.record.search_button")}</button></form>
    {policy && <section className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm" aria-labelledby="positions-title">
      <h2 id="positions-title" className="font-medium">{t("membership.position.rules_title")}</h2>
      <p className="text-muted">{t("membership.position.rules_body")}</p>
      <p>{t("membership.position.seats", { used: policy.auditors, seats: policy.auditor_seats })}</p>
      {policy.can_set_seats && <form onSubmit={saveSeats} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1"><span className="block">{t("membership.position.seats_label")}</span>
          <input type="number" min={1} max={15} required value={seats} onChange={e => setSeats(e.target.value)} className={`${fieldClass} min-h-11 w-24`} /></label>
        <button disabled={busy || seats === String(policy.auditor_seats)} className="min-h-11 rounded-md border border-input px-4 disabled:opacity-50">{t("dues.save")}</button>
      </form>}
      {!policy.can_assign && <p className="text-muted">{t("membership.position.chair_assigns")}</p>}
    </section>}
    {error && <Banner tone="error" message={error} />}{notice && <p role="status" className="text-success">{notice}</p>}
    {!data && (error ? <button onClick={() => void load()} className="min-h-11 rounded-md border border-input px-4">{t("membership.retry")}</button> : <LoadingBlock />)}
    {data?.members.length === 0 && <p className="text-muted">{t("membership.record.no_members")}</p>}
    {data?.members.map(m => <article key={m.user_id} className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <div><h2 className="font-medium">{m.name}</h2><p className="break-all text-sm text-muted">{m.email}</p></div>
      <p className="text-sm">{t(`membership.record.status.${m.status}`)}{m.is_primary && ` · ${t("membership.record.primary")}`}</p>
      {m.member_since && <p className="text-sm text-muted">{t("membership.record.joined")}: {memberDate(m.member_since)}</p>}
      {policy?.can_assign && (policy.can_assign_chair || m.position !== "chair")
        ? <label className="flex flex-wrap items-center gap-2 text-sm"><span>{t("membership.position.label")}:</span>
            <select value={m.position ?? "member"} disabled={busy} onChange={e => void setPosition(m, e.target.value as MemberPosition)} className={`${fieldClass} min-h-11`}>
              {MEMBER_POSITIONS.map(p => <option key={p} value={p} disabled={p === "chair" && !policy.can_assign_chair}>{t(`membership.position.${p}`)}</option>)}
            </select>
            <span className="text-muted">{t(`membership.position.grants.${m.position ?? "member"}`)}</span></label>
        : <p className="text-sm">{t("membership.position.label")}: {t(`membership.position.${m.position ?? "member"}`)}</p>}
      <p className="text-sm text-muted">{t("membership.record.work_roles")}: {m.roles.join(", ") || "—"}</p>
      {isAdmin && <button onClick={() => { setEditing(m); setStatus(m.status === "none" ? "active" : m.status); setReason(""); setError(""); }} className="min-h-11 rounded-md border border-input px-4">{m.status === "none" ? t("membership.record.confirm_primary") : t("membership.record.change_status")}</button>}
    </article>)}
    {data?.has_more && <button disabled={busy} onClick={() => void more()} className="min-h-11 rounded-md border border-input px-4">{t("membership.record.more")}</button>}
    {editing && <Modal onClose={() => { if (!busy) setEditing(null); }}>
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-lg font-semibold">{editing.name} · {t("membership.record.change_status")}</h2>
        <p className="text-sm text-muted">{t("membership.record.status_hint")}</p>
        <label className="block space-y-2"><span>{t("membership.record.status_label")}</span><select value={status} onChange={e => setStatus(e.target.value as MemberStatus)} className={`${fieldClass} min-h-11 w-full`}>{transitions.map(s => <option key={s} value={s}>{t(`membership.record.status.${s}`)}</option>)}</select></label>
        <label className="block space-y-2"><span>{t("membership.record.reason")}</span><textarea required maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} className={`${fieldClass} w-full`} /></label>
        {error && <Banner tone="error" message={error} />}
        <div className="flex gap-3"><button disabled={busy || !reason.trim()} className="min-h-11 rounded-md bg-accent px-5 text-on-accent disabled:opacity-50">{t("dues.save")}</button><button type="button" disabled={busy} onClick={() => setEditing(null)} className="min-h-11 rounded-md border border-input px-4">{t("membership.back")}</button></div>
      </form>
    </Modal>}
  </div>;
}
