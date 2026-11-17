"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";

import ArchiveForm from "@/components/archive/ArchiveForm";
import { archiveApi, type ArchiveDocument } from "@/lib/api/archive";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { Banner, LoadingBlock } from "@/components/ui";

/** Editing a draft: its text and its signers; a vote protocol only its signers. */
export default function EditArchiveDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const errorMessage = useErrorMessage({ fallback: "events.archive.error.load" });
  const [doc, setDoc] = useState<ArchiveDocument | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    archiveApi.get(id).then(r => { if (live) setDoc(r.document); }).catch(err => { if (live) setError(errorMessage(err)); });
    return () => { live = false; };
  }, [id, errorMessage]);
  return <div className="mx-auto max-w-[860px] space-y-5 pb-6">
    <h1 className="flex items-center gap-2 text-2xl font-semibold"><Pencil aria-hidden="true" className="h-6 w-6 text-accent" />{t("events.archive.form.edit_title")}</h1>
    {error && <Banner tone="error" message={error} />}
    {!doc && !error && <LoadingBlock />}
    {doc && (doc.status === "draft" ? <ArchiveForm document={doc} /> : <Banner tone="info" message={t("events.archive.error.not_draft")} />)}
  </div>;
}
