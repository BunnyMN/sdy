"use client";

/**
 * Гарын үсэг зурагчдыг дарааллаар сонгох: «Бүх тэргүүлэгч», «Тэргүүн, Нарийн
 * бичиг», тэдгээрийн нийлбэр, нэрээр хайх, дээш/доош, хасах. Төсөл засах ба
 * илгээсэн баримтын зурагч солих хоёулаа үүнийг ашиглана.
 */

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, TriangleAlert, Users, X } from "lucide-react";

import { archiveApi, type SignerCandidate, type SignerCandidates } from "@/lib/api/archive";
import { useI18n } from "@/lib/i18n";
import { fieldClass } from "@/components/ui";
import { addSigners, boardWithOfficers, moveSigner } from "@/lib/archive";

export type Signer = Pick<SignerCandidate, "user_id" | "name" | "position_title" | "has_eid">;

const btn = "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-input px-3 text-sm disabled:opacity-50";

export default function SignerPicker({ signers, setSigners, exclude = [] }: {
  signers: Signer[];
  setSigners: (change: (current: Signer[]) => Signer[]) => void;
  /** People who may not be added (e.g. those who already signed). */
  exclude?: string[];
}) {
  const { t } = useI18n();
  const [presets, setPresets] = useState<SignerCandidates | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SignerCandidate[]>([]);

  useEffect(() => {
    let live = true;
    archiveApi.candidates().then(c => { if (live) { setPresets(c); setFound(c.members); } }).catch(() => {});
    return () => { live = false; };
  }, []);

  // Search as the manager types, a moment after they stop.
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      archiveApi.candidates(query.trim()).then(c => { if (live) setFound(c.members); }).catch(() => {});
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query]);

  const blocked = new Set(exclude);
  const add = (list: Signer[]) => setSigners(s => addSigners(s, list.filter(c => !blocked.has(c.user_id))));
  const chosen = new Set([...signers.map(s => s.user_id), ...exclude]);
  const combined = presets ? boardWithOfficers(presets) : [];
  return <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={!presets?.board.length} onClick={() => add(presets?.board ?? [])}>
          <Users aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.preset_board", { count: presets?.board.length ?? 0 })}</button>
        <button type="button" className={btn} disabled={!presets?.officers.length} onClick={() => add(presets?.officers ?? [])}>
          <Users aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.preset_officers")}</button>
        <button type="button" className={btn} disabled={combined.length === 0} onClick={() => add(combined)}>
          <Users aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.preset_all", { count: combined.length })}</button>
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
          <button type="button" className={btn} onClick={() => add([c])}><Plus aria-hidden="true" className="h-4 w-4" />{t("events.archive.form.add")}</button>
        </li>)}
      </ul>
  </>;
}
