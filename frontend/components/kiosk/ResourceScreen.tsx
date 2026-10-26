"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { kioskList, kioskCreate, kioskUpdate, kioskRemove } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { KioskResource } from "@/lib/kiosk/types";
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react";
import { MediaCell, MediaViewer } from "./MediaCell";
import { formatNumber } from "@/lib/datetime";
import { useUrlState } from "@/lib/urlState";
import { Banner, ConfirmDialog, ErrorNote, LoadingBlock, Modal } from "@/components/ui";

const PAGE_SIZES = [25, 50, 100, 200, 500];
const DEFAULT_PAGE_SIZE = 50;

/**
 * The screen every declared kiosk resource renders through: list, create, edit
 * and delete, driven entirely by the resource definition.
 *
 * Errors are shown rather than swallowed. Most kiosk endpoints proxy other
 * Gerege services, so "cannot reach Core" is a common and very different thing
 * from "no records" — an empty table for both would be a lie.
 */
export default function ResourceScreen({ resource }: { resource: KioskResource }) {
  const { t } = useI18n();
  const idKey = resource.idKey ?? "id";
  const base = resource.app ?? "kiosk";

  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  // The page and its size live in the address, so a refresh, the Back button
  // and a pasted link all land on the same slice of the table.
  const [urlState, setUrlState] = useUrlState({ page: "1", size: String(DEFAULT_PAGE_SIZE) });
  const page = Math.max(1, Math.floor(Number(urlState.page)) || 1);
  const pageSize = PAGE_SIZES.includes(Number(urlState.size)) ? Number(urlState.size) : DEFAULT_PAGE_SIZE;
  const setPage = useCallback(
    (next: number | ((current: number) => number)) =>
      setUrlState({ page: String(typeof next === "function" ? next(page) : next) }),
    [page, setUrlState],
  );
  // False when the endpoint answered with the whole table; the slice is then
  // ours to take rather than the server's.
  const [serverPaged, setServerPaged] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  // What the form opened with, so closing it can tell an untouched form from
  // one with typing in it — the checkboxes are controlled, so the dialog's own
  // field scan cannot see them.
  const [opened, setOpened] = useState<Record<string, any>>({});
  const [formError, setFormError] = useState("");
  const [confirming, setConfirming] = useState<Record<string, any> | null>(null);
  const [viewing, setViewing] = useState<{ url: string; name?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Sent unconditionally. Every module built on the go_grc paginator
      // defaults to 50 whether or not it is asked, so a screen that stayed
      // silent got a silent truncation — 837 terminals reported and 50 shown,
      // with no way to reach the rest. The endpoints that ignore these
      // parameters are unaffected by them.
      const params: Record<string, string | number> = {
        ...(resource.listParams ?? {}),
        page_size: pageSize,
        page_number: page,
      };
      const res = await kioskList(resource.list, params, base);
      setRows(res.items || []);
      setTotal(res.total || 0);
      setServerPaged(res.serverPaged);
    } catch (err: any) {
      setError(err?.message || t("kiosk.message.load_failed"));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [resource, base, page, pageSize, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    const blank: Record<string, any> = {};
    for (const f of resource.fields ?? []) {
      if (f.readOnly) continue;
      blank[f.key] = f.type === "boolean" ? false : "";
    }
    setForm(blank);
    setOpened(blank);
    setEditing({});
    setIsNew(true);
    setFormError("");
  };

  const openEdit = (row: Record<string, any>) => {
    const filled: Record<string, any> = {};
    for (const f of resource.fields ?? []) {
      const v = row[f.key];
      filled[f.key] = f.type === "json" && v && typeof v === "object" ? JSON.stringify(v, null, 2) : v ?? "";
    }
    filled[idKey] = row[idKey];
    setForm(filled);
    setOpened(filled);
    setEditing(row);
    setIsNew(false);
    setFormError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const payload: Record<string, any> = {};
      for (const f of resource.fields ?? []) {
        if (f.readOnly) continue;
        let v = form[f.key];
        if (f.type === "number") v = v === "" || v === null ? undefined : Number(v);
        if (f.type === "json" && typeof v === "string" && v.trim() !== "") {
          // Rejected here rather than sent, so a typo reads as a form error and
          // not as an opaque failure from the API.
          try {
            v = JSON.parse(v);
          } catch {
            throw new Error(`${t(f.label)}: ${t("kiosk.message.invalid_json")}`);
          }
        }
        if (v !== undefined) payload[f.key] = v;
      }
      if (!isNew) payload[idKey] = form[idKey];

      if (isNew) await kioskCreate(resource.create!, payload, base);
      else await kioskUpdate(resource.update!, payload, base);

      setEditing(null);
      await load();
    } catch (err: any) {
      setFormError(err?.message || t("kiosk.message.save_failed"));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await kioskRemove(resource.remove!, confirming[idKey], idKey, base);
      setConfirming(null);
      await load();
    } catch (err: any) {
      setError(err?.message || t("kiosk.message.delete_failed"));
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  // A server-paged response is already the page. A bare array is the whole
  // table, so the slice happens here.
  const visible = serverPaged ? rows : rows.slice((page - 1) * pageSize, page * pageSize);
  const firstShown = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  // What a row is called, for the delete dialog: the media name when the
  // resource has one, else the first column. "Delete this record?" with no
  // name is a question nobody can answer.
  const rowName = (row: Record<string, any>) => {
    const named = resource.media?.nameKey ? row[resource.media.nameKey] : undefined;
    const first = resource.columns[0] ? row[resource.columns[0].key] : undefined;
    const value = named ?? first ?? row[idKey];
    return value === null || value === undefined || value === "" ? String(row[idKey] ?? "") : String(value);
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(opened);

  const canWrite = Boolean(resource.create || resource.update || resource.remove);
  const actionCount = useMemo(
    () => (resource.update ? 1 : 0) + (resource.remove ? 1 : 0),
    [resource.update, resource.remove],
  );

  return (
    // The AI Copilot is a fixed button in the bottom-right corner, and the
    // pager is the last thing on the page — scrolled to the end, the two landed
    // on top of each other and the page buttons could not be clicked. The
    // padding keeps the end of the content clear of it.
    <div className="space-y-6 pb-24">
      <div className="flex items-start justify-between border-b border-line pb-4 gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{t(resource.title)}</h1>
          <p className="text-sm text-muted">{t(resource.description)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void load()}
            className="border border-input text-foreground hover:bg-surface-hover font-medium text-sm py-2 px-3 rounded-lg flex items-center gap-2"
            aria-label={t("kiosk.action.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {resource.create && (
            <button
              onClick={openCreate}
              className="bg-accent hover:bg-accent-hover text-on-accent font-medium text-sm py-2 px-4 rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{t("kiosk.action.create")}</span>
            </button>
          )}
        </div>
      </div>

      {!canWrite && resource.readOnlyReason && (
        <div className="p-3 bg-surface-2 border border-line text-muted text-sm rounded-lg">
          {t(resource.readOnlyReason)}
        </div>
      )}

      {error && <Banner tone="error" message={error} onDismiss={() => setError("")} />}

      {loading ? (
        <LoadingBlock label={t("kiosk.message.loading")} />
      ) : rows.length === 0 && !error ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-muted text-sm">
          {t("kiosk.message.empty")}
        </div>
      ) : rows.length > 0 ? (
        <>
          {/* Scrolls inside its own box so the header row can stay in view:
              a sticky header sticks to its nearest scrolling ancestor, and at
              500 rows a page the column names were otherwise long gone. */}
          <div className="bg-surface border border-line rounded-xl overflow-auto max-h-[70vh]">
            <table className="w-full text-left border-collapse text-sm">
              <caption className="sr-only">{t(resource.title)}</caption>
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-surface-2 border-b border-line text-muted font-semibold text-xs uppercase tracking-wider">
                  {resource.media && <th scope="col" className="py-3 px-4 w-px bg-surface-2">{t("kiosk.field.preview")}</th>}
                  {resource.columns.map((c) => (
                    <th key={c.key} scope="col" className="py-3 px-4 whitespace-nowrap bg-surface-2">{t(c.label)}</th>
                  ))}
                  {actionCount > 0 && (
                    <th scope="col" className="py-3 px-4 w-px bg-surface-2">
                      <span className="sr-only">{t("base.field.actions")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((row, i) => (
                  <tr key={String(row[idKey] ?? i)} className="hover:bg-surface-hover">
                    {resource.media && (
                      <td className="py-2 px-4">
                        <MediaCell
                          url={String(row[resource.media.urlKey] ?? "")}
                          name={resource.media.nameKey ? String(row[resource.media.nameKey] ?? "") : undefined}
                          onOpen={() =>
                            setViewing({
                              url: String(row[resource.media!.urlKey] ?? ""),
                              name: resource.media!.nameKey ? String(row[resource.media!.nameKey] ?? "") : undefined,
                            })
                          }
                        />
                      </td>
                    )}
                    {resource.columns.map((c) => (
                      // Truncated to keep the row on one line, so the whole
                      // value is offered on hover rather than lost.
                      <td key={c.key} className="py-3.5 px-4 text-foreground max-w-xs truncate" title={plain(row[c.key])}>
                        {c.render ? c.render(row) : format(row[c.key])}
                      </td>
                    ))}
                    {actionCount > 0 && (
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 justify-end">
                          {resource.update && (
                            <button
                              onClick={() => openEdit(row)}
                              className="p-1.5 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"
                              aria-label={`${t("kiosk.action.edit")}: ${rowName(row)}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {resource.remove && (
                            <button
                              onClick={() => setConfirming(row)}
                              className="p-1.5 rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                              aria-label={`${t("kiosk.action.delete")}: ${rowName(row)}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <div className="flex items-center gap-3">
              <span>
                {formatNumber(firstShown)}–{formatNumber(lastShown)} / {formatNumber(total)}
              </span>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">{t("kiosk.label.per_page")}</span>
                <select
                  value={pageSize}
                  onChange={(e) => setUrlState({ size: e.target.value, page: "1" })}
                  className="border border-input rounded-lg px-2 py-1 text-sm bg-surface"
                >
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {pages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-surface-hover"
                  aria-label={t("kiosk.action.first_page")}
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-surface-hover"
                  aria-label={t("kiosk.action.prev_page")}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-1 tabular-nums">{page} / {formatNumber(pages)}</span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-surface-hover"
                  aria-label={t("kiosk.action.next_page")}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(pages)}
                  className="p-1.5 rounded-lg border border-input disabled:opacity-40 hover:bg-surface-hover"
                  aria-label={t("kiosk.action.last_page")}
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      ) : null}

      {editing && resource.fields && (
        <Modal
          size="lg"
          label={`${isNew ? t("kiosk.action.create") : t("kiosk.action.edit")} — ${t(resource.title)}`}
          onClose={busy ? undefined : () => setEditing(null)}
          dirty={dirty}
          className="max-h-[90vh] flex flex-col !p-0"
        >
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-xl font-semibold text-foreground">
              {isNew ? t("kiosk.action.create") : t("kiosk.action.edit")} — {t(resource.title)}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label={t("base.action.close")}
              className="grid h-9 w-9 place-items-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover"
            >
              <X aria-hidden="true" className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={submit} className="px-6 pb-6 space-y-4 overflow-y-auto">
            {formError && <ErrorNote>{formError}</ErrorNote>}
            {resource.fields.filter((f) => !f.readOnly).map((f) => (
              <div key={f.key}>
                <label htmlFor={`kiosk-field-${f.key}`} className="block text-xs font-semibold text-foreground mb-1">
                  {t(f.label)}
                  {f.required && <span aria-hidden="true" className="text-danger"> *</span>}
                </label>
                {f.type === "boolean" ? (
                  <input
                    id={`kiosk-field-${f.key}`}
                    type="checkbox"
                    checked={Boolean(form[f.key])}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                    className="w-4 h-4"
                  />
                ) : f.type === "textarea" || f.type === "json" ? (
                  <textarea
                    id={`kiosk-field-${f.key}`}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={f.required}
                    rows={f.type === "json" ? 6 : 3}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-surface font-mono"
                  />
                ) : (
                  <input
                    id={`kiosk-field-${f.key}`}
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={f.required}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-surface"
                  />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={busy}
                className="w-1/2 bg-surface-2 hover:bg-surface-hover text-foreground font-medium py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {t("kiosk.action.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="w-1/2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent font-medium py-2 rounded-lg text-sm"
              >
                {busy ? t("kiosk.message.saving") : t("kiosk.action.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && <MediaViewer url={viewing.url} name={viewing.name} onClose={() => setViewing(null)} />}

      {confirming && (
        <ConfirmDialog
          title={`${t("kiosk.action.delete")}: ${rowName(confirming)}`}
          body={t("kiosk.message.confirm_delete")}
          confirmLabel={t("kiosk.action.delete")}
          cancelLabel={t("kiosk.action.cancel")}
          tone="danger"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void doRemove()}
        />
      )}
    </div>
  );
}

function format(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The cell's value as plain text, for the hover title of a truncated cell. */
function plain(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
