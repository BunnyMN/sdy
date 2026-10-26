"use client";

import React from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Copying a value, and saying truthfully whether it worked.
 *
 * The kit's version called `navigator.clipboard.writeText` without awaiting
 * it and showed the tick straight away. The call is refused more often than
 * that suggests — an insecure origin, a document without focus, a browser that
 * asks permission and was told no — and in every one of those the operator saw
 * "copied", closed the one-time secret dialog, and pasted whatever was on the
 * clipboard before. So the tick waits for the promise, and a refusal says so.
 */

/** Put text on the clipboard. Resolves true only when it is actually there. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Refused — fall through to the older route, which some refusals allow.
  }
  // execCommand is deprecated and still the only thing that works on a
  // non-secure origin (a LAN address during a pilot) and in some webviews.
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    area.remove();
    return !!ok;
  } catch {
    return false;
  }
}

/**
 * Which value was last copied, so one button among several can show the tick.
 *
 *   const { copied, failed, copy } = useCopy();
 *   await copy(secret, "secret");   // copied === "secret" for 2s, only on success
 *
 * `failed` is the id whose copy was refused, so the button can say so and the
 * screen can select the text for a manual copy.
 */
export function useCopy() {
  const [copied, setCopied] = React.useState("");
  const [failed, setFailed] = React.useState("");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = React.useCallback(async (value: string, id = "default") => {
    const ok = await copyText(value);
    clearTimeout(timer.current);
    setCopied(ok ? id : "");
    setFailed(ok ? "" : id);
    timer.current = setTimeout(() => {
      setCopied("");
      setFailed("");
    }, ok ? 2000 : 4000);
    return ok;
  }, []);

  return { copied, failed, copy };
}

/**
 * A copy button with an icon, an accessible name, and an announcement.
 *
 * Self-contained by default:
 *
 *   <CopyButton value={clientID} />
 *   <CopyButton value={url} label={t("base.action.copy")} />   // icon + visible text
 *
 * The kit's controlled form still works — `copied` and `onCopy` from a shared
 * useCopy(), so a list of rows shows one tick at a time:
 *
 *   const { copied, failed, copy } = useCopy();
 *   <CopyButton value={key.kid} id={key.kid} copied={copied} failed={failed} onCopy={copy} />
 *
 * `selectOnFail` is the element holding the value as text; when the clipboard
 * refuses, its contents are selected so Ctrl+C is one key away.
 */
export function CopyButton({
  value,
  id = "default",
  label,
  copied: controlledCopied,
  failed: controlledFailed,
  onCopy,
  selectOnFail,
  className = "",
}: {
  value: string;
  id?: string;
  /** Visible text beside the icon. Without it the button is icon-only and named by aria-label. */
  label?: string;
  copied?: string;
  failed?: string;
  onCopy?: (value: string, id: string) => unknown;
  selectOnFail?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const { t } = useI18n();
  const own = useCopy();
  const controlled = onCopy !== undefined;
  const isCopied = (controlled ? controlledCopied : own.copied) === id;
  const isFailed = (controlled ? controlledFailed : own.failed) === id;

  React.useEffect(() => {
    if (!isFailed || !selectOnFail?.current) return;
    const range = document.createRange();
    range.selectNodeContents(selectOnFail.current);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isFailed, selectOnFail]);

  const name = isCopied ? t("base.message.copied") : isFailed ? t("base.message.copy_failed") : t("base.action.copy");
  const Icon = isCopied ? Check : isFailed ? AlertTriangle : Copy;

  return (
    <>
      <button
        type="button"
        onClick={() => void (controlled ? onCopy(value, id) : own.copy(value, id))}
        aria-label={label ? undefined : name}
        title={name}
        // 44px of target around a 14px icon, pulled back with negative margins
        // so a row that holds one does not grow taller for it.
        className={`shrink-0 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover ${
          label ? "px-3 text-xs font-medium" : "-m-3"
        } ${className}`}
      >
        <Icon
          aria-hidden="true"
          className={`w-3.5 h-3.5 ${isCopied ? "text-success" : isFailed ? "text-danger" : ""}`}
        />
        {label && <span>{isCopied ? t("base.message.copied") : label}</span>}
      </button>
      {/* Outside the button: a live region inside a control is announced
          inconsistently, and this one has to be heard — "copied" is the
          only feedback a screen reader user gets. */}
      <span className="sr-only" role="status" aria-live="polite">
        {isCopied ? t("base.message.copied") : isFailed ? t("base.message.copy_failed") : ""}
      </span>
    </>
  );
}
