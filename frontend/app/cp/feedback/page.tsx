"use client";

/**
 * What people said through the front page's suggestion box.
 *
 * Anybody may write one, signed in or not, so this is a reading list rather
 * than a queue somebody owns: an operator reads, and marks where each one
 * stands. The text itself cannot be edited here — the console holds no grant
 * for it — because a suggestion an operator can rewrite is no longer the
 * suggestion somebody made.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge, Card, formatMoment, Table, type Tone } from "@/components/cp/ui";
import { Banner, ErrorNote } from "@/components/ui";
import { cp, type Feedback, type FeedbackStatus } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";
import { useUrlState } from "@/lib/urlState";

const STATUSES: FeedbackStatus[] = ["new", "seen", "planned", "done", "dismissed"];
const CATEGORIES: Feedback["category"][] = ["idea", "request", "bug", "other"];

const CATEGORY_TONE: Record<Feedback["category"], Tone> = {
  idea: "emerald",
  request: "amber",
  bug: "red",
  other: "slate",
};

export default function FeedbackScreen() {
  const { t } = useI18n();
  // The filters are what the reader is looking at, so they live in the
  // address: a refresh keeps them and a pasted link opens the same list.
  const [view, setView] = useUrlState({ status: "", category: "", q: "" });
  const filter = (STATUSES as string[]).includes(view.status) ? (view.status as FeedbackStatus) : "";
  const [items, setItems] = useState<Feedback[]>([]);
  const [counts, setCounts] = useState<Partial<Record<FeedbackStatus, number>>>({});
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  // The row whose status is being written; its select is disabled until the
  // answer arrives, so a second change cannot race the first.
  const [moving, setMoving] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const answer = await cp.feedback(filter);
      setItems(answer.feedback);
      setCounts(answer.counts);
      setFailure("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(id: string, status: FeedbackStatus) {
    setMoving(id);
    setNotice("");
    setFailure("");
    try {
      await cp.feedbackStatus(id, status);
      await load();
      setNotice(t("cp.feedback.moved", { status: t(`cp.feedback.status.${status}`) }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setMoving("");
    }
  }

  const total = STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  // Category and text are narrowed here: the API filters by status only, and
  // the list it returns is one page of reading, not a table of thousands.
  const shown = useMemo(() => {
    const needle = view.q.trim().toLowerCase();
    return items.filter(
      (item) =>
        (!view.category || item.category === view.category) &&
        (!needle ||
          [item.message, item.name, item.contact, item.page].some((field) => field?.toLowerCase().includes(needle))),
    );
  }, [items, view.category, view.q]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">{t("cp.section.feedback")}</h1>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("cp.feedback.field.status")}>
        {(["", ...STATUSES] as const).map((status) => (
          <button
            key={status || "all"}
            type="button"
            aria-pressed={filter === status}
            onClick={() => setView({ status })}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === status ? "border-accent bg-accent text-on-accent" : "border-input hover:bg-surface-hover"
            }`}
          >
            {status ? t(`cp.feedback.status.${status}`) : t("cp.feedback.all")}{" "}
            <span className="tabular-nums opacity-75">{status ? counts[status] ?? 0 : total}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={view.q}
          onChange={(event) => setView({ q: event.target.value })}
          aria-label={t("cp.feedback.search")}
          placeholder={t("cp.feedback.search")}
          className="min-w-0 flex-1 rounded-lg border border-input bg-surface px-3 py-2 text-sm"
        />
        <select
          value={view.category}
          onChange={(event) => setView({ category: event.target.value })}
          aria-label={t("cp.feedback.field.category")}
          className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
        >
          <option value="">{t("cp.feedback.all_categories")}</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(`cp.feedback.category.${category}`)}
            </option>
          ))}
        </select>
      </div>

      {failure && <ErrorNote>{failure}</ErrorNote>}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}

      <Card title={t("cp.section.feedback")}>
        <Table
          head={[t("cp.feedback.field.message"), t("cp.feedback.field.from"), t("cp.feedback.field.when"), t("cp.feedback.field.status")]}
          loading={loading && items.length === 0}
          rows={shown.map((item) => [
            <span key="m" className="block max-w-xl">
              <Badge tone={CATEGORY_TONE[item.category]}>{t(`cp.feedback.category.${item.category}`)}</Badge>
              <span className="mt-1 block whitespace-pre-wrap text-foreground">{item.message}</span>
              {item.page && <span className="block text-xs text-muted">{item.page}</span>}
            </span>,
            <span key="f">
              <span className="block text-foreground">{item.name || t("cp.feedback.anonymous")}</span>
              {item.contact && <span className="block text-xs text-muted">{item.contact}</span>}
            </span>,
            formatMoment(item.created_at),
            <span key="s" className="inline-flex items-center gap-2">
              <select
                value={item.status}
                disabled={moving === item.id}
                aria-busy={moving === item.id}
                onChange={(event) => void move(item.id, event.target.value as FeedbackStatus)}
                aria-label={t("cp.feedback.field.status")}
                className="rounded-lg border border-input bg-surface px-2 py-1 text-xs disabled:opacity-60"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{t(`cp.feedback.status.${status}`)}</option>
                ))}
              </select>
              {moving === item.id && <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin text-muted" />}
            </span>,
          ])}
          empty={
            items.length > 0 || view.category || view.q ? t("cp.audit.empty_filtered") : t("cp.feedback.empty")
          }
        />
      </Card>
    </div>
  );
}
