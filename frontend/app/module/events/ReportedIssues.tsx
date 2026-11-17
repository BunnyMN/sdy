"use client";

/**
 * Мэдээлсэн асуудлууд — зохион байгуулагчийн (events.manage) хяналтын самбар.
 *
 * Гишүүд хэлэлцүүлгийн асуудлыг мэдээлдэг; санал хураалт нээгдээгүй асуудлыг
 * hide_after гишүүн мэдээлбэл гишүүдэд нуугдана (events/reports.go). Энэ
 * самбар тэдгээрийг нэг дор харуулж, мэдээллийг хэрэгсэхгүй болгох (асуудал
 * дахин харагдана) боломж олгоно. Хэн мэдээлснийг серверээс огт ирүүлдэггүй.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";

import { moderationApi, type ReportedIssue } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { Panel, Chip, ErrorNote } from "@/components/module/kit";
import { useConfirm } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { formatWhen } from "./shared";

export function ReportedIssues() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();
  const [issues, setIssues] = useState<ReportedIssue[] | null>(null);
  const [hideAfter, setHideAfter] = useState(3);
  const [failed, setFailed] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setFailed("");
    try {
      const answer = await moderationApi.reported();
      setIssues(answer.issues);
      setHideAfter(answer.hide_after);
    } catch (err: unknown) {
      setFailed(errorMessage(err));
    }
  }, [errorMessage]);

  useEffect(() => { void load(); }, [load]);

  async function dismiss(issue: ReportedIssue) {
    const answer = await confirm({
      title: t("events.moderation.dismiss_confirm", { title: issue.title }),
      reasonLabel: t("events.moderation.dismiss_reason"),
      reasonRequired: false,
      confirmLabel: t("events.moderation.dismiss"),
    });
    if (!answer) return;
    setBusy(issue.motion_id); setFailed(""); setNotice("");
    try {
      await moderationApi.dismiss(issue.event_id, issue.motion_id, answer.reason);
      setNotice(t("events.moderation.dismissed"));
      await load();
    } catch (err: unknown) {
      setFailed(errorMessage(err));
    } finally {
      setBusy("");
    }
  }

  // Nothing reported is nothing to show: the panel is not a permanent fixture.
  if (!failed && (!issues || issues.length === 0) && !notice) return null;
  return (
    <Panel className="p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Flag aria-hidden="true" className="h-4 w-4" />{t("events.moderation.title")}</h2>
      <p className="text-xs text-muted">{t("events.moderation.hint", { count: hideAfter })}</p>
      {failed && <ErrorNote>{failed}</ErrorNote>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <ul className="divide-y divide-line">
        {(issues ?? []).map((issue) => (
          <li key={issue.motion_id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{issue.title}</strong>
              <Chip tone="amber">{t("events.moderation.reports", { count: issue.report_count })}</Chip>
              {issue.hidden && <Chip tone="rose">{t("events.moderation.hidden")}</Chip>}
            </div>
            <p className="text-xs text-muted">{issue.event_title} · {issue.proposer_name}</p>
            {issue.body && <p className="whitespace-pre-wrap break-words text-sm">{issue.body}</p>}
            <ul className="space-y-1 text-xs text-muted">
              {issue.reports.map((report, i) => (
                <li key={i}><span className="tabular-nums">{formatWhen(report.created_at)}</span> — {report.reason || t("events.moderation.no_reason")}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href={`/module/events/${issue.event_id}#discussion`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm">{t("events.moderation.open")}</Link>
              <button type="button" disabled={busy !== ""} onClick={() => void dismiss(issue)} className="min-h-11 rounded-lg border border-line px-4 text-sm disabled:opacity-50">{t("events.moderation.dismiss")}</button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
