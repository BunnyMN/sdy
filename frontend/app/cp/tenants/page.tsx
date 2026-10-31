"use client";

/**
 * Every organisation on the deployment.
 *
 * The console's front page was this list until CP-4 gave it a health summary;
 * the list moved here rather than being squeezed onto it, because they answer
 * different questions — "is the platform well" and "who is on it" — and a
 * screen that tries to do both does neither at a glance.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Search } from "lucide-react";

import { useConsole } from "@/components/cp/Console";
import { formatMoment } from "@/components/cp/ui";
import { cp, type DirectoryOrganisation, type TenantSummary } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";
import { Banner, Card, ErrorNote, Modal, Table } from "@/components/ui";
import { useUrlState } from "@/lib/urlState";

import {
  compareValues,
  requiredLabel,
  SortHeader,
  tenantState,
  TenantStateBadge,
  useStepUp,
  useVerifiedPeople,
  type SortDirection,
} from "./shared";

const STATES = ["", "active", "suspended", "deleting"] as const;

/** What each sortable column sorts on. */
const SORT_KEYS: Record<string, (tenant: TenantSummary) => string | number | null> = {
  name: (tenant) => tenant.name,
  registration: (tenant) => tenant.registration_number,
  users: (tenant) => tenant.user_count,
  apps: (tenant) => tenant.app_count,
  activity: (tenant) => tenant.last_activity_at,
};

export default function Tenants() {
  const { t } = useI18n();
  const { operator } = useConsole();
  const [creating, setCreating] = useState(false);
  // Хайлт, төлөв, эрэмбэ хаягт үлдэнэ: refresh, back, линк хуваалцах
  // гурвуулаа ажиллана. Бичихэд шууд хариу өгөхийн тулд хайлтын талбар нь
  // локал төлөвтэй, хаяг руу нь ачаалалттай хамт debounce-оор бичигдэнэ.
  const [urlState, setUrlState] = useUrlState({ q: "", state: "", sort: "name", dir: "asc" });
  const [search, setSearch] = useState(urlState.q);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  // Each request takes a ticket; only the newest one may write. Otherwise a
  // slow answer to "601" lands after the fast one to "6012345" and the list
  // shows organisations that do not match what is in the box.
  const latest = useRef(0);

  const load = useCallback(async (query: string) => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const result = await cp.tenants(query);
      if (ticket !== latest.current) return;
      setTenants(result.tenants);
      setFailure("");
    } catch (error) {
      if (ticket !== latest.current) return;
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Debounced, so typing a registration number is one query rather than
    // eleven.
    const timer = setTimeout(() => {
      setUrlState({ q: search });
      void load(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, load, setUrlState]);

  const sort = urlState.sort in SORT_KEYS ? urlState.sort : "name";
  const direction: SortDirection = urlState.dir === "desc" ? "desc" : "asc";
  const onSort = (column: string) =>
    setUrlState({ sort: column, dir: sort === column && direction === "asc" ? "desc" : "asc" });

  // Sorted and filtered here rather than by the server: the list is one page
  // of organisations, already in hand.
  const shown = useMemo(() => {
    const key = SORT_KEYS[sort];
    return tenants
      .filter((tenant) => !urlState.state || tenantState(tenant) === urlState.state)
      .sort((a, b) => compareValues(key(a), key(b), direction));
  }, [tenants, urlState.state, sort, direction]);

  const header = (column: string, label: string, align?: "right") => (
    <SortHeader label={label} column={column} sort={sort} direction={direction} onSort={onSort} align={align} />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">{t("cp.section.tenants")}</h1>
          <p className="mt-1 text-sm text-muted">{t("cp.view.subtitle")}</p>
        </div>
        {(operator.role === "superadmin" || operator.role === "operator") && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:brightness-105"
          >
            <Plus className="w-4 h-4" />
            {t("cp.action.new_tenant")}
          </button>
        )}
      </div>

      <Banner tone="warning" message={t("cp.message.read_only")} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search aria-hidden="true" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("cp.field.search")}
            aria-label={t("cp.field.search")}
            className="w-full rounded-xl border border-input bg-surface pl-9 pr-3 py-2.5"
          />
        </div>
        <div role="group" aria-label={t("cp.filter.by_state")} className="flex flex-wrap gap-2">
          {STATES.map((option) => (
            <button
              key={option || "all"}
              type="button"
              aria-pressed={urlState.state === option}
              onClick={() => setUrlState({ state: option })}
              className={`rounded-lg border px-3 py-2 text-sm ${
                urlState.state === option
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-input text-muted hover:bg-surface-hover"
              }`}
            >
              {option ? t(`cp.state.${option}` as "cp.state.active") : t("cp.filter.all_states")}
            </button>
          ))}
        </div>
      </div>

      {failure && <ErrorNote>{t("cp.message.load_failed")}</ErrorNote>}

      <Card>
        <Table
          caption={t("cp.section.tenants")}
          head={[
            header("name", t("cp.field.organisation")),
            header("registration", t("cp.field.registration")),
            header("users", t("cp.field.users")),
            header("apps", t("cp.field.apps")),
            header("activity", t("cp.field.last_activity")),
            t("cp.field.state"),
          ]}
          rowKey={(_, index) => shown[index]?.id ?? index}
          rows={shown.map((tenant) => [
            <span key="n" className="block min-w-0">
              <Link
                href={`/cp/tenants/${tenant.id}`}
                className="flex items-center gap-2 font-medium text-foreground hover:underline"
              >
                <Building2 aria-hidden="true" className="w-4 h-4 text-muted" />
                {tenant.name}
              </Link>
              <span className="text-xs text-muted">{tenant.slug}</span>
            </span>,
            <span key="r" className="text-muted">{tenant.registration_number || "—"}</span>,
            <span key="u" className="tabular-nums">{tenant.user_count}</span>,
            <span key="a" className="tabular-nums">{tenant.app_count}</span>,
            <span key="l" className="text-muted">
              {formatMoment(tenant.last_activity_at) || t("cp.message.never")}
            </span>,
            <TenantStateBadge key="s" tenant={tenant} />,
          ])}
          loading={loading && tenants.length === 0}
          empty={t("cp.message.no_tenants")}
        />
      </Card>
      {creating && (
        <NewTenantDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load(search);
          }}
        />
      )}
    </div>
  );
}

/**
 * Opening an organisation.
 *
 * The apps are a comma-separated list of catalogue slugs rather than a picker,
 * because the catalogue a deployment carries is its own and a hard-coded set of
 * checkboxes here would be wrong on the first deployment that adds a module.
 *
 * Two things here are read rather than typed. The organisation's details come
 * from the Gerege Core register — a name typed from a form is a name that is
 * nearly right, and "nearly" is what makes two records of the same company.
 * The first administrator is chosen from the people this deployment has
 * already watched sign in with eID, so the account that ends up running an
 * organisation is one somebody proved they hold, rather than an address
 * somebody typed.
 */
function NewTenantDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [registration, setRegistration] = useState("");
  const [legalName, setLegalName] = useState("");
  const [apps, setApps] = useState("");
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // The register.
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<DirectoryOrganisation | null>(null);

  // The administrator.
  const { search, setSearch, people, loading: peopleLoading } = useVerifiedPeople(setFailure);
  const [admin, setAdmin] = useState<(typeof people)[number] | null>(null);
  const stepUp = useStepUp();

  async function lookUp() {
    if (!registration.trim()) return;
    setLooking(true);
    setFailure("");
    try {
      const org = await cp.findOrganisation(registration.trim());
      setFound(org);
      setName(org.name);
      setLegalName(org.legal_name);
      setSlug(org.suggested_slug.toLowerCase());
      setRegistration(org.registration_number);
    } catch (error) {
      setFound(null);
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLooking(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      const created = await stepUp.run(() => cp.createTenant({
        name,
        slug,
        legal_name: legalName,
        registration_number: registration,
        apps: apps.split(",").map((app) => app.trim()).filter(Boolean),
        admin_user_id: admin?.user_id,
        reason,
      }));
      // An organisation created with an app that would not install, or an
      // invitation that could not be sent, is still an organisation — and the
      // operator has to be told which parts did not land rather than finding
      // out when the customer calls.
      // A chosen administrator is not invited — they already have a way in —
      // so a missing invitation is only worth reporting when one was meant.
      if (created.failed.length || (!created.invited && !created.admin_existed)) {
        setNotice(
          [
            created.failed.length ? `${t("cp.field.apps")}: ${created.failed.join(", ")}` : "",
            created.invited ? "" : created.invite_error || "",
          ]
            .filter(Boolean)
            .join(" · "),
        );
        return;
      }
      onCreated();
    } catch (error) {
      if (stepUp.isStepUp(error)) return;
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} label={t("cp.action.new_tenant")} size="lg">
      <form onSubmit={submit} className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("cp.action.new_tenant")}</h2>

        {stepUp.prompt}
        {failure && <ErrorNote>{failure}</ErrorNote>}
        {notice && (
          <div className="space-y-2">
            <Banner tone="warning" message={notice} />
            <button
              type="button"
              onClick={onCreated}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105"
            >
              {t("cp.action.back")}
            </button>
          </div>
        )}

        {!notice && (
          <>
            {/* The register first: everything below it is filled from the
                answer, and typed over only when the register is wrong. */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <TextField label={t("cp.field.registration")} value={registration} onChange={setRegistration} required />
              </div>
              <button
                type="button"
                onClick={() => void lookUp()}
                disabled={looking || !registration.trim()}
                className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-surface-hover disabled:opacity-50"
              >
                <Search aria-hidden="true" className={`w-4 h-4 ${looking ? "animate-pulse" : ""}`} />
                {t("cp.action.look_up")}
              </button>
            </div>
            {found && (
              <p className="text-xs rounded-lg bg-accent-soft text-accent px-3 py-2">
                {t("cp.message.from_the_register", { name: found.legal_name || found.name })}
                {found.address ? ` · ${found.address}` : ""}
              </p>
            )}

            <TextField label={t("cp.field.name")} value={name} onChange={setName} required />
            <TextField label={t("cp.field.legal_name")} value={legalName} onChange={setLegalName} />
            <TextField label={t("cp.field.slug")} value={slug} onChange={(value) => setSlug(value.toLowerCase())} required />
            <TextField label={t("cp.field.install_apps")} value={apps} onChange={setApps} />

            {/* The first administrator, chosen rather than typed. */}
            <div className="space-y-2">
              <p className={`text-sm font-medium text-foreground ${requiredLabel}`}>{t("cp.field.admin")}</p>
              <p className="text-xs text-muted">{t("cp.hint.admin_is_chosen")}</p>
              {admin ? (
                <div className="flex items-center gap-3 rounded-lg border border-accent bg-accent-soft px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-foreground truncate">{admin.name}</strong>
                    <span className="block text-xs text-muted truncate">
                      {admin.email}
                      {admin.reg_number ? ` · ${admin.reg_number}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdmin(null)}
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
                        onClick={() => setAdmin(person)}
                        className="w-full text-left px-3 py-2 hover:bg-surface-hover"
                      >
                        <strong className="block text-sm text-foreground truncate">{person.name}</strong>
                        <span className="block text-xs text-muted truncate">
                          {person.email}
                          {person.reg_number ? ` · ${person.reg_number}` : ""}
                          {" · "}
                          {t("cp.message.already_in", { count: String(person.organisations) })}
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
            </div>

            <TextField label={t("cp.field.reason")} value={reason} onChange={setReason} required />
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
                disabled={busy || !admin}
                title={admin ? undefined : t("cp.hint.admin_is_chosen")}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
              >
                {t("cp.action.create")}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className={`text-muted${required ? ` ${requiredLabel}` : ""}`}>{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
      />
    </label>
  );
}
