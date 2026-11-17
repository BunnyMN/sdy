"use client";

import { FilePlus2 } from "lucide-react";

import ArchiveForm from "@/components/archive/ArchiveForm";
import { useI18n } from "@/lib/i18n";

/** A new archive draft (archive.manage — Тэргүүн, Нарийн бичиг, админ). */
export default function NewArchiveDocumentPage() {
  const { t } = useI18n();
  return <div className="mx-auto max-w-[860px] space-y-5 pb-6">
    <h1 className="flex items-center gap-2 text-2xl font-semibold"><FilePlus2 aria-hidden="true" className="h-6 w-6 text-accent" />{t("events.archive.form.new_title")}</h1>
    <ArchiveForm />
  </div>;
}
