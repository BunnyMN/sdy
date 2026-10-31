"use client";

/**
 * Telling everybody something.
 *
 * An announcement appears as a banner above the tenant application's chrome,
 * for everybody or for one organisation, between two dates. It expires by
 * itself — which is the property that makes people willing to write them: a
 * notice that has to be taken down by hand is a notice nobody puts up on a
 * Friday.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";

import { useAction } from "@/components/cp/Action";
import { Badge, Card, formatMoment, Table } from "@/components/cp/ui";
import { cp, type Announcement, type TenantSummary } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";
import { ubLocalToISO } from "@/lib/ubTime";
import { ErrorNote, Modal } from "@/components/ui";

const REQUIRED = "after:ml-0.5 after:text-danger after:content-['*']";

export default function Announcements() {
  const { t } = useI18n();
  const action = useAction();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [writing, setWriting] = useState(false);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  // The organisations, so a row says whose it is by name and the dialog can
  // offer a list instead of a box for a pasted UUID. Not being able to read
  // them costs only that: the rows fall back to the id.
  const [tenants, setTenants] = useState<TenantSummary[]>([]);

  const load = useCallback(async () => {
    try {
      setAnnouncements((await cp.announcements()).announcements);
      setFailure("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    cp.tenants("")
      .then((result) => setTenants(result.tenants ?? []))
      .catch(() => setTenants([]));
  }, [load]);

  const tenantName = (id: string) => tenants.find((tenant) => tenant.id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">{t("cp.section.announcements")}</h1>
        </div>
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:brightness-105"
        >
          <Megaphone className="w-4 h-4" />
          {t("cp.action.announce")}
        </button>
      </div>

      {failure && <ErrorNote>{failure}</ErrorNote>}

      <Card title={t("cp.section.announcements")}>
        <Table
          head={[t("cp.field.title"), t("cp.field.kind"), t("cp.field.organisation"), t("cp.field.until"), ""]}
          rows={announcements.map((announcement) => [
            <span key="t">
              <strong className="text-foreground">{announcement.title}</strong>
              {announcement.body && <span className="block text-xs text-muted">{announcement.body}</span>}
            </span>,
            <Badge key="k" tone={announcement.kind === "maintenance" ? "red" : announcement.kind === "warning" ? "amber" : "slate"}>
              {t(`cp.kind.${announcement.kind}`)}
            </Badge>,
            announcement.tenant_id ? (
              <span key="o" title={announcement.tenant_id}>
                {tenantName(announcement.tenant_id) ?? (
                  <span className="font-mono text-xs">{announcement.tenant_id}</span>
                )}
              </span>
            ) : (
              t("cp.state.everyone")
            ),
            formatMoment(announcement.ends_at) || "—",
            <button
              key="w"
              type="button"
              onClick={() =>
                action.run({
                  title: t("cp.action.withdraw"),
                  detail: announcement.title,
                  danger: true,
                  perform: (reason) => cp.withdraw(announcement.id, reason),
                  onDone: load,
                })
              }
              className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover"
            >
              {t("cp.action.withdraw")}
            </button>,
          ])}
          loading={loading}
          empty={t("cp.message.no_announcements")}
        />
      </Card>

      {writing && (
        <WriteDialog
          tenants={tenants}
          onClose={() => setWriting(false)}
          onPublished={() => {
            setWriting(false);
            void load();
          }}
        />
      )}
      {action.dialog}
    </div>
  );
}

function WriteDialog({
  tenants,
  onClose,
  onPublished,
}: {
  tenants: TenantSummary[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"info" | "warning" | "maintenance">("info");
  const [tenantID, setTenantID] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      await cp.announce({
        title,
        body,
        kind,
        // Empty means everybody.
        tenant_id: tenantID || null,
        // The time typed is Ulaanbaatar's, as every time this console shows
        // is — not whatever zone the operator's laptop is set to.
        ends_at: endsAt ? ubLocalToISO(endsAt) || null : null,
        reason,
      });
      onPublished();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} label={t("cp.action.announce")}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{t("cp.action.announce")}</h2>

        {failure && <ErrorNote>{failure}</ErrorNote>}

        <label className="block text-sm">
          <span className={`text-muted ${REQUIRED}`}>{t("cp.field.title")}</span>
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.body")}</span>
          <textarea
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.kind")}</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          >
            <option value="info">{t("cp.kind.info")}</option>
            <option value="warning">{t("cp.kind.warning")}</option>
            <option value="maintenance">{t("cp.kind.maintenance")}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.organisation")}</span>
          <select
            value={tenantID}
            onChange={(event) => setTenantID(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          >
            <option value="">{t("cp.state.everyone")}</option>
            {[...tenants]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </option>
              ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.until")}</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            aria-describedby="announcement-until-hint"
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
          <span id="announcement-until-hint" className="mt-1 block text-xs text-muted">
            {t("cp.hint.ub_time")}
          </span>
        </label>

        <label className="block text-sm">
          <span className={`text-muted ${REQUIRED}`}>{t("cp.field.reason")}</span>
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
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
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
          >
            {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
            {t("cp.action.announce")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
