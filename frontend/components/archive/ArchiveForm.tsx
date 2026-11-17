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
import SignerPicker, { type Signer } from "@/components/archive/SignerPicker";
import { archiveApi, type ArchiveDocument, type ArchiveKind } from "@/lib/api/archive";
import { eventsApi, type EventRecord } from "@/lib/api/events";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Banner, fieldClass, selectClass } from "@/components/ui";
import { ARCHIVE_PATH, archiveErrorKey } from "@/lib/archive";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const explain = (err: unknown) => { const key = archiveErrorKey(err); return key ? t(key) : errorMessage(err); };

  useEffect(() => {
    let live = true;
    if (!protocol) eventsApi.list().then(r => { if (live) setEvents(r.events); }).catch(() => {});
    return () => { live = false; };
  }, [protocol]);

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
      <SignerPicker signers={signers} setSigners={setSigners} />
    </section>

    <div className="flex flex-wrap gap-2">
      <button disabled={busy || (!protocol && !title.trim())} className="min-h-11 rounded-md bg-accent px-5 font-medium text-on-accent disabled:opacity-50">{t("events.archive.form.save")}</button>
      <button type="button" disabled={busy} onClick={() => router.back()} className="min-h-11 rounded-md border border-input px-4">{t("events.discussion.cancel")}</button>
    </div>
  </form>;
}
