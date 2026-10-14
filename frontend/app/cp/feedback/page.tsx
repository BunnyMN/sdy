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

import React, { useCallback, useEffect, useState } from "react";

import { Badge, Card, formatMoment, Table, type Tone } from "@/components/cp/ui";
import { cp, type Feedback, type FeedbackStatus } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";

const STATUSES: FeedbackStatus[] = ["new", "seen", "planned", "done", "dismissed"];

const CATEGORY_TONE: Record<Feedback["category"], Tone> = {
  idea: "emerald",
  request: "amber",
  bug: "red",
  other: "slate",
};

export default function FeedbackScreen() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FeedbackStatus | "">("");
  const [items, setItems] = useState<Feedback[]>([]);
  const [counts, setCounts] = useState<Partial<Record<FeedbackStatus, number>>>({});
  const [failure, setFailure] = useState("");

  const load = useCallback(async () => {
    try {
      const answer = await cp.feedback(filter);
      setItems(answer.feedback);
      setCounts(answer.counts);
      setFailure("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(id: string, status: FeedbackStatus) {
    try {
      await cp.feedbackStatus(id, status);
      await load();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  const total = STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">{t("cp.section.feedback")}</h1>

      <div className="flex flex-wrap gap-2" role="tablist">
        {(["", ...STATUSES] as const).map((status) => (
          <button
            key={status || "all"}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === status ? "border-accent bg-accent text-on-accent" : "border-input hover:bg-surface-hover"
            }`}
          >
            {status ? t(`cp.feedback.status.${status}`) : t("cp.feedback.all")}{" "}
            <span className="tabular-nums opacity-75">{status ? counts[status] ?? 0 : total}</span>
          </button>
        ))}
      </div>

      {failure && (
        <p role="alert" className="text-sm rounded-lg bg-red-50 text-red-700 border border-red-200 px-3 py-2">{failure}</p>
      )}

      <Card title={t("cp.section.feedback")}>
        <Table
          head={[t("cp.feedback.field.message"), t("cp.feedback.field.from"), t("cp.feedback.field.when"), t("cp.feedback.field.status")]}
          rows={items.map((item) => [
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
            <select
              key="s"
              value={item.status}
              onChange={(event) => void move(item.id, event.target.value as FeedbackStatus)}
              aria-label={t("cp.feedback.field.status")}
              className="rounded-lg border border-input px-2 py-1 text-xs"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>{t(`cp.feedback.status.${status}`)}</option>
              ))}
            </select>,
          ])}
          empty={t("cp.feedback.empty")}
        />
      </Card>
    </div>
  );
}
