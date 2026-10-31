"use client";

import React, { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Play, ImageOff, FileQuestion, X, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v", "ogv", "ogg"];

export type MediaKind = "image" | "video" | "unknown";

/**
 * What a URL points at, judged by extension.
 *
 * The CDN serves the real content type but a HEAD per row would be fifty
 * requests to render one page, and the rows that carry no extension are the
 * ones that 404 anyway — bad data rather than an unlabelled file.
 */
export function mediaKind(url: string): MediaKind {
  const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url || "");
  if (!m) return "unknown";
  const ext = m[1].toLowerCase();
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  return "unknown";
}

/** The small preview in a table cell. Opens the viewer when clicked. */
export function MediaCell({ url, name, onOpen }: { url: string; name?: string; onOpen: () => void }) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const kind = mediaKind(url);

  if (!url) return <span className="text-muted">—</span>;

  const frame = "w-16 h-10 rounded border border-line grid place-items-center overflow-hidden shrink-0";

  if (kind === "image" && !broken) {
    return (
      <button onClick={onOpen} className={`${frame} bg-surface-2 hover:border-accent`} title={name || url}>
        {/* Plain img, not next/image: these are arbitrary CDN paths and some of
            them 404, which the optimizer turns into a server-side error. */}
        <img
          src={url}
          alt={name || ""}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      </button>
    );
  }

  if (kind === "video") {
    // No <video> here on purpose: a metadata preload per row is a range
    // request per row. The file is only fetched once the viewer opens.
    return (
      <button
        onClick={onOpen}
        className={`${frame} bg-foreground text-background hover:ring-2 hover:ring-accent`}
        title={name || url}
        aria-label={t("kiosk.action.play")}
      >
        <Play className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button onClick={onOpen} className={`${frame} bg-surface-2 text-muted hover:border-accent`} title={name || url}>
      {broken ? <ImageOff className="w-4 h-4" /> : <FileQuestion className="w-4 h-4" />}
    </button>
  );
}

/** Full-size viewer: images are shown, videos play. */
export function MediaViewer({ url, name, onClose }: { url: string; name?: string; onClose: () => void }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const kind = mediaKind(url);

  return (
    // The shared Modal: Escape and the backdrop close it, focus is held inside
    // and handed back to the thumbnail that opened it.
    <Modal label={name || url} onClose={onClose} className="!max-w-4xl !p-0 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between gap-4 p-4 border-b border-line">
        <h2 className="font-semibold text-foreground truncate" title={name || url}>{name || url}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg text-muted hover:bg-surface-hover"
            aria-label={t("kiosk.action.open_original")}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("base.action.close")}
            className="grid h-9 w-9 place-items-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 overflow-auto grid place-items-center bg-surface-2 min-h-[240px]">
        {failed || kind === "unknown" ? (
          // Roughly one row in ten carries a malformed URL — a doubled CDN
          // prefix, or a name with no file behind it. Saying so beats a
          // silently empty box.
          <div className="text-center py-10">
            <ImageOff aria-hidden="true" className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted text-sm">{t("kiosk.message.media_unavailable")}</p>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline break-all mt-2 inline-block">
              {url}
            </a>
          </div>
        ) : kind === "image" ? (
          <img src={url} alt={name || ""} className="max-h-[70vh] max-w-full object-contain" onError={() => setFailed(true)} />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            className="max-h-[70vh] max-w-full"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </Modal>
  );
}
