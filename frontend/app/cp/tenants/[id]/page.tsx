"use client";

/**
 * One organisation, and everything an operator may do to it.
 *
 * The read half is metadata: apps, people, the two audit trails, who has been
 * inside. The write half is the lifecycle — suspend, resume, ask for deletion,
 * cancel one, set limits, step inside — and every button on it goes through
 * useAction, which asks for a reason and, when the window has closed, for the
 * authenticator code. Nothing here writes without both.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Download,
  Eye,
  Gauge,
  Pause,
  Play,
  Trash2,
  Undo2,
  UserPlus,
  Wrench,
} from "lucide-react";

import { useConsole } from "@/components/cp/Console";
import { useAction } from "@/components/cp/Action";
import { Badge, Card, formatMoment, Table } from "@/components/cp/ui";
import { cp, type Quota, type TenantDetail, type VerifiedPerson } from "@/lib/cp";
import { formatDay } from "@/lib/datetime";
import { useI18n } from "@/lib/i18n";
import { daysUntil } from "@/lib/ubTime";
import { useUrlState } from "@/lib/urlState";
import { ErrorNote, LoadingBlock, Modal } from "@/components/ui";

import { requiredLabel, TenantStateBadge, useStepUp, useVerifiedPeople } from "../shared";

const TABS = ["members", "apps", "impersonations", "activity", "operator_actions"] as const;
type Tab = (typeof TABS)[number];

/** How many rows a history tab shows before "view all". */
const PREVIEW_ROWS = 10;

/** The grace period the server gives an approved deletion (lifecycle.go). */
const DELETION_GRACE_DAYS = 30;

export default function Detail() {
  const { t } = useI18n();
  const { operator } = useConsole();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const action = useAction();

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [failure, setFailure] = useState("");
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  // Which section is open lives in the address, so a link to "this
  // organisation's operator actions" opens on them.
  const [urlState, setUrlState] = useUrlState({ tab: "members" });
  const tab: Tab = (TABS as readonly string[]).includes(urlState.tab) ? (urlState.tab as Tab) : "members";

  const load = useCallback(async () => {
    try {
      setTenant(await cp.tenant(id));
      setFailure("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  if (failure) {
    return (
      <div className="space-y-4">
        <BackLink label={t("cp.action.back")} />
        <ErrorNote>{t("cp.message.load_failed")}</ErrorNote>
      </div>
    );
  }
  if (!tenant) return <LoadingBlock />;

  const suspended = !!tenant.suspended_at;
  const deleting = !!tenant.deletion_scheduled_at;
  const may = (capability: string) => allowed(operator.role, capability);

  return (
    <div className="space-y-6">
      <BackLink label={t("cp.action.back")} />

      <div className="flex flex-wrap items-start gap-3">
        <Building2 className="w-6 h-6 text-muted mt-1" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            {tenant.name}
            <TenantStateBadge tenant={tenant} />
          </h1>
          <p className="text-sm text-muted">
            {tenant.slug}
            {tenant.legal_name ? ` · ${tenant.legal_name}` : ""}
          </p>
          {suspended && tenant.suspension_reason && (
            <p className="mt-1 text-sm text-warning">{tenant.suspension_reason}</p>
          )}
          {deleting && <DeletionDate at={tenant.deletion_scheduled_at} />}
        </div>
      </div>

      <section className="bg-surface rounded-xl border border-line p-4">
        <h2 className="text-sm font-medium text-muted mb-3">{t("cp.section.actions")}</h2>
        <div className="flex flex-wrap gap-2">
          {may("tenant.suspend") && !suspended && (
            <ActionButton
              icon={<Pause className="w-4 h-4" />}
              label={t("cp.action.suspend")}
              onClick={() =>
                action.run({
                  title: t("cp.action.suspend"),
                  detail: tenant.name,
                  danger: true,
                  perform: (reason) => cp.suspend(tenant.id, reason),
                  onDone: load,
                })
              }
            />
          )}
          {may("tenant.suspend") && suspended && !deleting && (
            <ActionButton
              icon={<Play className="w-4 h-4" />}
              label={t("cp.action.resume")}
              onClick={() =>
                action.run({
                  title: t("cp.action.resume"),
                  detail: tenant.name,
                  perform: (reason) => cp.resume(tenant.id, reason),
                  onDone: load,
                })
              }
            />
          )}
          {may("quota.write") && (
            <ActionButton
              icon={<Gauge className="w-4 h-4" />}
              label={t("cp.action.quota")}
              onClick={() => setQuotaOpen(true)}
            />
          )}
          {may("settings.write") && (
            <ActionButton
              icon={<Wrench className="w-4 h-4" />}
              label={tenant.maintenance_at ? t("cp.action.maintenance_off") : t("cp.action.maintenance_on")}
              onClick={() =>
                action.run({
                  title: tenant.maintenance_at ? t("cp.action.maintenance_off") : t("cp.action.maintenance_on"),
                  detail: tenant.name,
                  perform: (reason) =>
                    cp.maintenance(tenant.id, !tenant.maintenance_at, reason, reason),
                  onDone: load,
                })
              }
            />
          )}
          {may("tenant.delete") && !deleting && (
            <ActionButton
              icon={<Trash2 className="w-4 h-4" />}
              label={t("cp.action.delete")}
              danger
              onClick={() =>
                action.run({
                  title: t("cp.action.delete"),
                  detail: t("cp.message.deletion_requested"),
                  // The name of what is being deleted, typed — a reason alone
                  // is one reflexive sentence away from the wrong organisation.
                  confirmText: tenant.slug,
                  body: (
                    <p>
                      <strong>{tenant.name}</strong>
                      {" · "}
                      {t("cp.message.deletion_when", {
                        date: formatDay(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000),
                      })}
                    </p>
                  ),
                  danger: true,
                  perform: (reason) => cp.requestDeletion(tenant.id, reason),
                  onDone: load,
                })
              }
            />
          )}
          {may("tenant.suspend") && deleting && (
            <ActionButton
              icon={<Undo2 className="w-4 h-4" />}
              label={t("cp.action.cancel_deletion")}
              onClick={() =>
                action.run({
                  title: t("cp.action.cancel_deletion"),
                  detail: tenant.name,
                  perform: (reason) => cp.cancelDeletion(tenant.id, reason),
                  onDone: load,
                })
              }
            />
          )}
          <Link
            href={`/cp/tenants/${tenant.id}/usage`}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-surface-hover"
          >
            <BarChart3 className="w-4 h-4" />
            {t("cp.action.usage")}
          </Link>
          {may("tenant.delete") && (
            <a
              href={cp.exportURL(tenant.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-surface-hover"
            >
              <Download className="w-4 h-4" />
              {t("cp.action.export")}
            </a>
          )}
        </div>
      </section>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("cp.field.registration")} value={tenant.registration_number || "—"} />
        <Fact label={t("cp.field.tax_number")} value={tenant.tax_number || "—"} />
        <Fact label={t("cp.field.created")} value={formatMoment(tenant.created_at)} />
        <Fact
          label={t("cp.field.users")}
          value={
            tenant.quota.max_users === null
              ? String(tenant.quota.users)
              : `${tenant.quota.users} / ${tenant.quota.max_users}`
          }
        />
      </dl>

      <div
        role="tablist"
        aria-label={t("cp.tab.tenant")}
        className="flex gap-1 overflow-x-auto border-b border-line"
        onKeyDown={(event) => {
          // Arrow keys move between tabs, as the tab pattern promises.
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const step = event.key === "ArrowRight" ? 1 : -1;
          const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
          setUrlState({ tab: next });
          document.getElementById(`tenant-tab-${next}`)?.focus();
        }}
      >
        {TABS.map((name) => (
          <button
            key={name}
            id={`tenant-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls="tenant-tab-panel"
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setUrlState({ tab: name })}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium -mb-px ${
              tab === name ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t(`cp.section.${name}` as "cp.section.apps")}
          </button>
        ))}
      </div>

      <div id="tenant-tab-panel" role="tabpanel" aria-labelledby={`tenant-tab-${tab}`}>
        {tab === "apps" && (
          <Card title={t("cp.section.apps")}>
            <Table
              head={[t("cp.field.apps"), t("cp.field.version"), t("cp.field.status"), t("cp.field.installed")]}
              rows={tenant.apps.map((app) => [
                app.name,
                app.version,
                <span key="s" className="inline-flex flex-wrap items-center gap-1.5">
                  {app.status}
                  {!app.enabled && <Badge tone="slate">{t("cp.state.off")}</Badge>}
                </span>,
                formatMoment(app.installed_at),
              ])}
              empty={t("cp.message.no_apps")}
            />
          </Card>
        )}

        {tab === "members" && (
          <Card
            title={t("cp.section.members")}
            action={
              !suspended && (
                <button
                  type="button"
                  onClick={() => setAddingPerson(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-input px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover"
                >
                  <UserPlus aria-hidden="true" className="w-3.5 h-3.5" />
                  {t("cp.action.add_person")}
                </button>
              )
            }
          >
            <Table
              head={[t("cp.field.email"), t("cp.field.person"), t("cp.field.roles"), ""]}
              rows={tenant.members.map((member) => [
                member.email,
                member.name,
                member.roles.length ? member.roles.join(", ") : "—",
                // Looking at the platform as somebody is a decision about *which*
                // somebody. It used to be a button on the action bar above that
                // took tenant.members[0] — whoever the list happened to start
                // with — so the operator got an arbitrary person and the reason
                // they typed named a different one.
                may("user.impersonate") && !suspended ? (
                  <button
                    key="i"
                    type="button"
                    onClick={() =>
                      action.run({
                        title: t("cp.action.impersonate"),
                        detail: member.email,
                        perform: async (reason) => {
                          const { url } = await cp.impersonate(tenant.id, member.user_id, reason);
                          // A new tab, so the console stays where it is: the
                          // operator is about to be two people at once and should
                          // not lose the window that can end it.
                          window.open(url, "_blank", "noopener");
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover"
                  >
                    <Eye aria-hidden="true" className="w-3.5 h-3.5" />
                    {t("cp.action.impersonate")}
                  </button>
                ) : (
                  <span key="i" />
                ),
              ])}
              empty={t("cp.message.no_members")}
            />
          </Card>
        )}

        {tab === "impersonations" && (
          <History
            title={t("cp.section.impersonations")}
            head={[t("cp.field.when"), t("cp.field.operator"), t("cp.field.person"), t("cp.field.reason")]}
            rows={tenant.impersonations.map((visit) => [
              formatMoment(visit.created_at),
              visit.operator_email,
              visit.user_email,
              visit.reason,
            ])}
            empty={t("cp.message.no_impersonations")}
          />
        )}

        {tab === "activity" && (
          <History
            title={t("cp.section.activity")}
            head={[t("cp.field.when"), t("cp.field.action"), t("cp.field.resource")]}
            rows={tenant.activity.map((entry) => [formatMoment(entry.created_at), entry.action, entry.resource])}
            empty={t("cp.message.no_activity")}
          />
        )}

        {tab === "operator_actions" && (
          <History
            title={t("cp.section.operator_actions")}
            head={[t("cp.field.when"), t("cp.field.operator"), t("cp.field.action"), t("cp.field.reason")]}
            rows={tenant.operator_actions.map((entry) => [
              formatMoment(entry.created_at),
              entry.operator_email,
              entry.action,
              entry.reason || "—",
            ])}
            empty={t("cp.message.no_operator_actions")}
            // The full trail is the audit screen, filtered to this organisation —
            // the same filter the server used to pick these rows.
            allHref={`/cp/audit?target_type=tenant&target_id=${encodeURIComponent(tenant.id)}`}
          />
        )}
      </div>

      {addingPerson && (
        <AddPersonDialog
          tenantID={tenant.id}
          onClose={() => setAddingPerson(false)}
          onAdded={() => {
            setAddingPerson(false);
            void load();
          }}
        />
      )}
      {quotaOpen && (
        <QuotaDialog
          tenantID={tenant.id}
          quota={tenant.quota}
          onClose={() => setQuotaOpen(false)}
          onSaved={() => {
            setQuotaOpen(false);
            void load();
          }}
        />
      )}
      {action.dialog}
    </div>
  );
}

/**
 * What each role may do, mirroring the capability table the server enforces.
 *
 * A copy, and it has to be: the server is the authority and answers 403
 * whatever this says. The copy exists so an operator is not shown buttons that
 * will refuse them — and it is deliberately the same shape as the Go map, so
 * the two can be compared by eye when a capability is added.
 */
const CAPABILITIES: Record<string, string[]> = {
  superadmin: ["tenant.suspend", "tenant.delete", "quota.write", "support.act",
    "user.impersonate", "approval.decide", "settings.write"],
  operator: ["tenant.suspend", "quota.write", "support.act", "settings.write"],
  support: ["support.act", "user.impersonate"],
  auditor: [],
};

function allowed(role: string, capability: string): boolean {
  return (CAPABILITIES[role] ?? []).includes(capability);
}

/** When an organisation on its way out is actually removed, and how long that leaves. */
function DeletionDate({ at }: { at: string | null }) {
  const { t } = useI18n();
  const days = daysUntil(at);
  const date = formatMoment(at);
  return (
    <p className="mt-1 text-sm text-danger">
      {days !== null && days > 0
        ? t("cp.message.deletion_scheduled", { date, days: String(days) })
        : t("cp.message.deletion_due", { date })}
    </p>
  );
}

/**
 * One of the history tabs: the latest rows, and the way to the rest. With
 * `allHref` the rest is another screen; without it, the rows already loaded.
 */
function History({
  title,
  head,
  rows,
  empty,
  allHref,
}: {
  title: string;
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
  allHref?: string;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const more = rows.length > PREVIEW_ROWS;
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS);
  const viewAll = allHref ? (
    <Link href={allHref} className="text-xs font-medium text-accent hover:underline">
      {t("cp.action.view_all")}
    </Link>
  ) : more ? (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((open) => !open)}
      className="text-xs font-medium text-accent hover:underline"
    >
      {expanded ? t("cp.action.show_fewer") : t("cp.action.view_all")}
    </button>
  ) : null;
  return (
    <Card title={title} action={viewAll ?? undefined}>
      <Table head={head} rows={shown} empty={empty} />
      {more && !expanded && (
        <p className="px-4 py-2 text-xs text-muted border-t border-line">
          {t("cp.message.showing", { shown: String(PREVIEW_ROWS), total: String(rows.length) })}
        </p>
      )}
    </Card>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
        danger
          ? "border-danger-border text-danger hover:bg-danger-soft"
          : "border-input text-foreground hover:bg-surface-hover"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function QuotaDialog({
  tenantID,
  quota,
  onClose,
  onSaved,
}: {
  tenantID: string;
  quota: Quota;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [users, setUsers] = useState(quota.max_users?.toString() ?? "");
  const [storage, setStorage] = useState(quota.max_storage_mb?.toString() ?? "");
  const [ai, setAI] = useState(quota.max_ai_calls_monthly?.toString() ?? "");
  const [enforcement, setEnforcement] = useState<"soft" | "hard">(quota.enforcement);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const stepUp = useStepUp();

  // An empty field is no limit at all, which is not the same as zero — the
  // server keeps the distinction and so does this form.
  const number = (raw: string) => (raw.trim() === "" ? null : Number(raw));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      await stepUp.run(() =>
        cp.setQuota(tenantID, {
          max_users: number(users),
          max_storage_mb: number(storage),
          max_ai_calls_monthly: number(ai),
          enforcement,
          reason,
        }),
      );
      onSaved();
    } catch (error) {
      if (stepUp.isStepUp(error)) return;
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} label={t("cp.section.limits")}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("cp.section.limits")}</h2>

        {stepUp.prompt}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        <Field label={t("cp.field.max_users")} value={users} onChange={setUsers} />
        <Field label={t("cp.field.max_storage")} value={storage} onChange={setStorage} hint={t("cp.hint.not_enforced")} />
        <Field label={t("cp.field.max_ai")} value={ai} onChange={setAI} hint={t("cp.hint.not_enforced")} />

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.enforcement")}</span>
          <select
            value={enforcement}
            onChange={(event) => setEnforcement(event.target.value as "soft" | "hard")}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          >
            <option value="soft">{t("cp.state.soft")}</option>
            <option value="hard">{t("cp.state.hard")}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className={`text-muted ${requiredLabel}`}>{t("cp.field.reason")}</span>
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-hover disabled:opacity-60"
          >
            {t("cp.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
          >
            {t("cp.action.confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
      />
      {hint && <span className="mt-1 block text-xs text-warning">{hint}</span>}
    </label>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/cp/tenants" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-xl border border-line px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Adding somebody to an organisation.
 *
 * The same list the first administrator is chosen from — people this
 * deployment has watched sign in with eID — and the same reason: an address
 * typed into a dialog is an address, and a choice is a person.
 *
 * They arrive with the smallest role the platform has. Anything above it is
 * granted by the organisation's own administrator, in their own access screen,
 * where the people who live with the decision can see it.
 */
function AddPersonDialog({
  tenantID,
  onClose,
  onAdded,
}: {
  tenantID: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<VerifiedPerson | null>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const { search, setSearch, people, loading: peopleLoading } = useVerifiedPeople(setFailure);
  // The API asks for the second factor before it hands anybody the keys to an
  // organisation's data. The code is asked for when the server says so, and
  // proved on submit — the same order as useAction.
  const stepUp = useStepUp();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setFailure("");
    try {
      await stepUp.run(() => cp.addMember(tenantID, chosen.user_id, reason));
      onAdded();
    } catch (error) {
      if (stepUp.isStepUp(error)) return;
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} label={t("cp.action.add_person")}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("cp.action.add_person")}</h2>
        <p className="text-xs text-muted">{t("cp.hint.member_is_chosen")}</p>

        {stepUp.prompt}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        {chosen ? (
          <div className="flex items-center gap-3 rounded-lg border border-accent bg-accent-soft px-3 py-2">
            <span className="min-w-0 flex-1">
              <strong className="block text-sm text-foreground truncate">{chosen.name}</strong>
              <span className="block text-xs text-muted truncate">{chosen.email}</span>
            </span>
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="text-xs rounded-lg border border-input bg-surface px-2 py-1 hover:bg-surface-hover"
            >
              {t("cp.action.change")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("cp.field.search_people")}
              aria-label={t("cp.field.search_people")}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            />
            <div
              aria-busy={peopleLoading}
              className="max-h-48 overflow-y-auto divide-y divide-line rounded-lg border border-line"
            >
              {people.map((person) => (
                <button
                  key={person.user_id}
                  type="button"
                  onClick={() => setChosen(person)}
                  className="w-full text-left px-3 py-2 hover:bg-surface-hover"
                >
                  <strong className="block text-sm text-foreground truncate">{person.name}</strong>
                  <span className="block text-xs text-muted truncate">
                    {person.email}
                    {person.reg_number ? ` · ${person.reg_number}` : ""}
                    {" · "}
                    {formatMoment(person.last_seen_at)}
                  </span>
                </button>
              ))}
              {people.length === 0 && !peopleLoading && (
                <p className="px-3 py-3 text-sm text-muted">{t("cp.message.no_verified_people")}</p>
              )}
            </div>
          </div>
        )}

        <label className="block text-sm">
          <span className={`text-muted ${requiredLabel}`}>{t("cp.field.reason")}</span>
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        {stepUp.field}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-hover disabled:opacity-60"
          >
            {t("cp.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || !chosen}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
          >
            {t("cp.action.add_person")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
