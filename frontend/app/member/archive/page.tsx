"use client";

/**
 * Салбарын гарын үсэгтэй архив: хурлын тэмдэглэл, шийдвэр, санал хураалтын
 * протокол. Гишүүн бүр харна (төслөөс бусдыг); «Миний зурах» нь тухайн хүний
 * зурах ээлж болсон баримтууд. Нарийн бичиг, Тэргүүн шинэ баримт үүсгэнэ.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ChevronRight, FilePlus2, PenLine } from "lucide-react";

import { archiveApi, type ArchiveDocument, type ArchiveKind, type ArchiveList, type ArchiveStatus } from "@/lib/api/archive";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Badge, Banner, LoadingBlock, selectClass } from "@/components/ui";
import { memberDate } from "@/lib/memberFormat";
import { ARCHIVE_KINDS, ARCHIVE_PATH, ARCHIVE_STATUSES, kindKey, progressText, statusKey, statusTone } from "@/lib/archive";

type Tab = "all" | "todo";

export default function ArchivePage() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage({ fallback: "events.archive.error.load" });
  const [tab, setTab] = useState<Tab>("all");
  const [kind, setKind] = useState<ArchiveKind | "">("");
  const [status, setStatus] = useState<ArchiveStatus | "">("");
  const [data, setData] = useState<ArchiveList | null>(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setError("");
    archiveApi.list({ kind, status, mine: tab === "todo" ? "todo" : "" })
      .then(r => { if (live) setData(r); })
      .catch(err => { if (live) setError(errorMessage(err)); });
    return () => { live = false; };
  }, [tab, kind, status, errorMessage]);

  const loadMore = useCallback(async () => {
    if (!data?.next_offset) return;
    setMore(true);
    try {
      const next = await archiveApi.list({ kind, status, mine: tab === "todo" ? "todo" : "", offset: data.next_offset });
      setData({ ...next, documents: [...data.documents, ...next.documents] });
    } catch (err) { setError(errorMessage(err)); }
    finally { setMore(false); }
  }, [data, kind, status, tab, errorMessage]);

  return <div className="mx-auto max-w-[860px] space-y-5 pb-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Archive aria-hidden="true" className="h-6 w-6 text-accent" />{t("events.archive.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("events.archive.hint")}</p>
      </div>
      {data?.can_manage && <Link href={`${ARCHIVE_PATH}/new`} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 font-medium text-on-accent">
        <FilePlus2 aria-hidden="true" className="h-4 w-4" />{t("events.archive.new")}</Link>}
    </header>

    {!!data?.todo && tab === "all" && <button type="button" onClick={() => setTab("todo")} className="flex w-full items-center gap-2 rounded-lg border border-accent bg-accent-soft px-4 py-3 text-left text-sm font-semibold text-accent">
      <PenLine aria-hidden="true" className="h-4 w-4" /><span className="flex-1">{t("events.archive.todo_count", { count: data.todo })}</span><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>}

    <div className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label={t("events.archive.title")} className="grid grid-cols-2 gap-2">
        {(["all", "todo"] as Tab[]).map(v => <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)}
          className={`min-h-11 rounded-md border px-4 text-sm ${tab === v ? "border-accent bg-accent-soft font-semibold text-accent" : "border-input"}`}>
          {t(v === "all" ? "events.archive.all" : "events.archive.todo")}{v === "todo" && data?.todo ? ` (${data.todo})` : ""}
        </button>)}
      </div>
      <label className="space-y-1 text-xs"><span className="block text-muted">{t("events.archive.filter_kind")}</span>
        <select value={kind} onChange={e => setKind(e.target.value as ArchiveKind | "")} className={selectClass}>
          <option value="">{t("events.archive.all")}</option>
          {ARCHIVE_KINDS.map(k => <option key={k} value={k}>{t(kindKey(k))}</option>)}
        </select></label>
      <label className="space-y-1 text-xs"><span className="block text-muted">{t("events.archive.filter_status")}</span>
        <select value={status} onChange={e => setStatus(e.target.value as ArchiveStatus | "")} className={selectClass}>
          <option value="">{t("events.archive.all")}</option>
          {ARCHIVE_STATUSES.filter(s => s !== "draft" || data?.can_manage).map(s => <option key={s} value={s}>{t(statusKey(s))}</option>)}
        </select></label>
    </div>

    {error && <Banner tone="error" message={error} />}
    {!data && !error && <LoadingBlock />}
    {data && data.documents.length === 0 && <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-muted">{t("events.archive.empty")}</p>}
    {data && data.documents.length > 0 && <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
      {data.documents.map(d => <ArchiveRow key={d.id} d={d} />)}
    </ul>}
    {data?.has_more && <button type="button" disabled={more} onClick={() => void loadMore()} className="min-h-11 w-full rounded-md border border-input disabled:opacity-50">{t("events.archive.more")}</button>}
  </div>;
}

function ArchiveRow({ d }: { d: ArchiveDocument }) {
  const { t } = useI18n();
  return <li><Link href={`${ARCHIVE_PATH}/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
    <span className="min-w-0 flex-1 space-y-1">
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t(kindKey(d.kind))}</span><span>· {d.number ? `№ ${d.number}` : t("events.archive.no_number")}</span>
        <span>· {memberDate(d.issued_at ?? d.created_at)}</span>
      </span>
      <span className="block truncate font-medium text-foreground">{d.title}</span>
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(d.status)}>{t(statusKey(d.status))}</Badge>
        {d.signer_count > 0 && <span className="text-xs tabular-nums text-muted">{t("events.archive.progress", { progress: progressText(d.signed_count, d.signer_count) })}</span>}
        {d.my_turn && <Badge tone="accent"><PenLine aria-hidden="true" className="h-3 w-3" />{t("events.archive.signer.current")}</Badge>}
      </span>
    </span>
    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
  </Link></li>;
}
