"use client";

import React from "react";
import { FileUp, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Picking a file to upload, with the limits said up front.
 *
 * The screens that took files used a bare <input type="file">, said nothing
 * about size or type, and learned about both from the server: a 40 MB scan
 * uploaded for a minute on a phone connection and came back "413" — in
 * English, after the wait. The limits are shown before anything is chosen and
 * checked the moment something is, so the answer arrives in a second and in
 * the reader's language.
 *
 * The server still checks; this is the courtesy, not the control.
 */

/** 1536 → "1.5 KB". Binary units, which is what the server's limits are written in. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Whether `file` matches an `accept` string the way the browser's picker does. */
export function fileAccepted(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

/** ".pdf,image/*" → "PDF, image" — the accept list as a person reads it. */
function describeAccept(accept: string): string {
  return accept
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((rule) => (rule.startsWith(".") ? rule.slice(1).toUpperCase() : rule.replace("/*", "")))
    .join(", ");
}

export function FileDropzone({
  onFile,
  accept,
  maxBytes,
  file,
  onClear,
  progress,
  disabled = false,
  label,
  hint,
  id,
}: {
  /** Called with a file that passed the checks below. Rejected files never reach it. */
  onFile: (file: File) => void;
  /** As on <input type="file">: ".pdf,.docx,image/*". Shown to the reader and enforced. */
  accept?: string;
  /** Largest file allowed, in bytes. Shown and enforced. */
  maxBytes?: number;
  /** The file currently chosen, if the parent keeps one — shown with a remove button. */
  file?: File | null;
  onClear?: () => void;
  /** 0–100 while uploading; undefined when not. */
  progress?: number;
  disabled?: boolean;
  /** A visible label above the zone. Without one, the zone's own text names it. */
  label?: string;
  /** A line under the limits — what the file is for, say. */
  hint?: string;
  id?: string;
}) {
  const { t } = useI18n();
  const input = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState("");
  const autoId = React.useId();
  const inputId = id || `${autoId}-file`;
  const limitsId = `${autoId}-limits`;
  const errorId = `${autoId}-error`;

  const types = accept ? describeAccept(accept) : "";
  const size = maxBytes ? formatBytes(maxBytes) : "";
  const limits =
    types && size
      ? t("base.file.limits", { types, size })
      : size
        ? t("base.file.limit_size", { size })
        : types;

  function take(list: FileList | null) {
    const chosen = list?.[0];
    if (!chosen) return;
    if (!fileAccepted(chosen, accept)) {
      setError(t("base.file.wrong_type", { name: chosen.name, types }));
      return;
    }
    if (maxBytes && chosen.size > maxBytes) {
      setError(t("base.file.too_large", { name: chosen.name, size }));
      return;
    }
    setError("");
    onFile(chosen);
  }

  const uploading = progress !== undefined;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) take(event.dataTransfer.files);
        }}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? "border-accent bg-accent-soft" : error ? "border-danger-border bg-danger-soft" : "border-input bg-surface"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <FileUp aria-hidden="true" className="w-6 h-6 text-muted" />
        <p className="text-sm text-foreground">
          {t("base.file.drop")}{" "}
          {/* The real control, styled as a link: keyboard and screen reader
              users reach the picker exactly as they would a bare input. */}
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => input.current?.click()}
            className="min-h-11 font-semibold text-accent underline underline-offset-2 disabled:no-underline"
          >
            {t("base.file.browse")}
          </button>
        </p>
        {limits && (
          <p id={limitsId} className="text-xs text-muted">
            {limits}
          </p>
        )}
        {hint && <p className="text-xs text-muted">{hint}</p>}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          aria-describedby={[limits ? limitsId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            take(event.target.files);
            // Choosing the same file again after a rejection must fire again.
            event.target.value = "";
          }}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {file && (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-foreground">
            {t("base.file.selected", { name: file.name })}{" "}
            <span className="text-muted">({formatBytes(file.size)})</span>
          </span>
          {onClear && !uploading && (
            <button
              type="button"
              onClick={onClear}
              aria-label={t("base.file.remove")}
              title={t("base.file.remove")}
              className="-m-2 grid min-h-11 min-w-11 place-items-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label={t("base.file.uploading", { percent: Math.round(progress) })}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
          <p className="text-xs text-muted" aria-live="polite">
            {t("base.file.uploading", { percent: Math.round(progress) })}
          </p>
        </div>
      )}
    </div>
  );
}
