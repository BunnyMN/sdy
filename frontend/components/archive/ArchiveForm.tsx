"use client";

/**
 * Архивын баримтын төсөл үүсгэх/засах: төрөл, гарчиг, агуулга, холбогдох арга
 * хэмжээ, гарын үсэг зурагчид (дарааллаар). «Бүх тэргүүлэгч» нь Тэргүүлэгч
 * албан тушаалтай бүх гишүүнийг нэмнэ; бусдыг нэрээр нь хайж нэмнэ. Санал
 * хураалтын протоколын агуулга нь санал хураалтаас гардаг тул зөвхөн зурагчид
 * засагдана.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Search, TriangleAlert, Users, X } from "lucide-react";

import {
  archiveApi, type ArchiveDocument, type ArchiveKind, type SignerCandidate, type SignerCandidates,
} from "@/lib/api/archive";
import { eventsApi, type EventRecord } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Banner, fieldClass, selectClass } from "@/components/ui";
import { ARCHIVE_PATH, addSigners, archiveErrorKey, moveSigner } from "@/lib/archive";

type Signer = Pick<SignerCandidate, "user_id" | "name" | "position_title" | "has_eid">;

const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-input px-3 text-sm disabled:opacity-50";

export default function ArchiveForm({ document }: { document?: ArchiveDocument }) {
  const { t } = useI18n();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const protocol = document?.kind === "vote_protocol";
  const [kind, setKind] = useState<ArchiveKind>(document?.kind ?? "minutes");
  const [title, setTitle] = useState(document?.title ?? "");
  const [body, setBody] = useState(document?.body ?? "");
  const [eventID, setEventID] = useState(document?.event_id ?? "");
  const [signers, setSigners] = useState<Signer[]>(() => (document?.signers ?? []).map(s => ({
    user_id: s.user_id, name: s.name, position_title: s.position_title, has_eid: s.has_eid,
  })));
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [presets, setPresets] = useState<SignerCandidates | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SignerCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const explain = (err: unknown) => { const key = archiveErrorKey(err); return key ? t(key) : errorMessage(err); };

  useEffect(() => {
    let live = true;
    archiveApi.candidates().then(c => { if (live) { setPresets(c); setFound(c.members); } }).catch(() => {});
    if (!protocol) eventsApi.list().then(r => { if (live) setEvents(r.events); }).catch(() => {});
    return () => { live = false; };
  }, [protocol]);

  // Search as the manager types, a moment after they stop.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      archiveApi.candidates(query.trim()).then(c => { if (live) setFound(c.members); }).catch(() => {});
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const input = { kind, title: title.trim(), body: body.trim(), event_id: eventID || null, signers: signers.map(s => s.user_id) };
    try {
      const answer = document ? await archiveApi.update(document.id, input) : await archiveApi.create(input);
      router.push(`${ARCHIVE_PATH}/${answer.document.id}`);
    } catch (err) {
      setError(explain(err));
      setBusy(false);
    }
  }

  const chosen = new Set(signers.map(s => s.user_id));
  return <form onSubmit={save} className="space-y-5">
    {error && <Banner tone="error" message={error} onDismiss={() => setError("")} />}

    {protocol ? <Banner tone="info" message={t("events.archive.form.protocol_note")} /> : <div className="space-y-4 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("events.archive.form.kind")}</span>
        <select value={kind} onChange={e => setKind(e.target.value as ArchiveKind)} className={selectClass}>
          <option value="minutes">{t("events.archive.kind.minutes")}</option>
          <option value="decision">{t("events.archive.kind.decision")}</option>
        </select></label>
      <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("events.archive.form.title")}</span>
        <input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className={fieldClass} /></label>
      <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("events.archive.form.body")}</span>
        <textarea rows={12} maxLength={20000} value={body} onChange={e => setBody(e.target.value)} className={`${fieldClass} min-h-48`} /></label>
      <label className="block space-y-1.5 text-sm"><span className="font-medium">{t("events.archive.form.event")}</span>
        <select value={eventID} onChange={e => setEventID(e.target.value)} className={selectClass}>
          <option value="">{t("events.archive.form.no_event")}</option>
          {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select></label>
    </div>}

    <section aria-labelledby="archive-signers" className="space-y-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 id="archive-signers" className="font-semibold">{t("events.archive.form.signers")}</h2>
        <p className="mt-1 text-xs text-muted">{t("events.archive.form.signers_hint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={!presets?.board.length} onClick={() => setSigners(s => addSigners(s, presets?.board ?? []))}>
          <Users aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.preset_board", { count: presets?.board.length ?? 0 })}</button>
        <button type="button" className={btn} disabled={!presets?.officers.length} onClick={() => setSigners(s => addSigners(s, presets?.officers ?? []))}>
          <Users aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.preset_officers")}</button>
      </div>

      {signers.length === 0 ? <p className="text-sm text-muted">{t("events.archive.form.none")}</p> : <ol className="divide-y divide-line rounded-md border border-line">
        {signers.map((s, i) => <li key={s.user_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="w-6 tabular-nums text-muted">{i + 1}.</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{s.name || "—"}</span>{s.position_title && <span className="text-muted"> · {s.position_title}</span>}
            {!s.has_eid && <span className="mt-0.5 flex items-center gap-1 text-xs text-warning"><TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />{t("events.archive.form.no_eid")}</span>}
          </span>
          <button type="button" aria-label={t("events.archive.form.up")} disabled={i === 0} onClick={() => setSigners(l => moveSigner(l, i, -1))} className="grid h-10 w-10 place-items-center rounded-md border border-input disabled:opacity-40"><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" aria-label={t("events.archive.form.down")} disabled={i === signers.length - 1} onClick={() => setSigners(l => moveSigner(l, i, 1))} className="grid h-10 w-10 place-items-center rounded-md border border-input disabled:opacity-40"><ArrowDown aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" aria-label={t("events.archive.form.remove")} onClick={() => setSigners(l => l.filter(x => x.user_id !== s.user_id))} className="grid h-10 w-10 place-items-center rounded-md border border-input"><X aria-hidden="true" className="h-4 w-4" /></button>
        </li>)}
      </ol>}

      <label className="relative block text-sm">
        <span className="sr-only">{t("events.archive.form.search")}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("events.archive.form.search")} className={`${fieldClass} pl-9`} />
      </label>
      <ul className="max-h-72 divide-y divide-line overflow-auto rounded-md border border-line">
        {found.filter(c => !chosen.has(c.user_id)).map(c => <li key={c.user_id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1"><span className="font-medium">{c.name || c.email}</span>
            {c.position_title && <span className="text-muted"> · {c.position_title}</span>}
            {!c.has_eid && <span className="block text-xs text-warning">{t("events.archive.form.no_eid")}</span>}</span>
          <button type="button" className={btn} onClick={() => setSigners(s => addSigners(s, [c]))}><Plus aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.add")}</button>
        </li>)}
      </ul>
    </section>

    <div className="flex flex-wrap gap-2">
      <button disabled={busy || (!protocol && !title.trim())} className="min-h-11 rounded-md bg-accent px-5 font-medium text-on-accent disabled:opacity-50">{t("events.archive.form.save")}</button>
      <button type="button" disabled={busy} onClick={() => router.back()} className="min-h-11 rounded-md border border-input px-4">{t("events.discussion.cancel")}</button>
    </div>
  </form>;
}
