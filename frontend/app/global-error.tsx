"use client";

/**
 * The root layout itself threw.
 *
 * This boundary replaces the whole document, so nothing above it survives: no
 * providers, no i18n, and not even `globals.css` — that import belongs to the
 * layout this file is standing in for. Everything it needs is therefore inline
 * and dependency-free, which is the point of a last-resort screen: it must
 * render when the thing that renders everything else did not.
 *
 * The language is read straight from the cookie the switcher writes, because
 * the provider that would normally answer that question is one of the things
 * that is gone. Two strings is the whole vocabulary; a dictionary here would be
 * one more thing to fail.
 */

import React from "react";

import { DEFAULT_LOCALE, LOCALE_KEY } from "@/lib/locale";

const COPY = {
  mn: {
    lang: "mn",
    title: "Энэ хуудсыг нээж чадсангүй",
    body: "Алдааг бүртгэлээ. Дахин оролдоод үзнэ үү; давтагдвал системийн админд хандана уу.",
    retry: "Дахин оролдох",
  },
  en: {
    lang: "en",
    title: "This page could not be opened",
    body: "The error has been logged. Try again; if it keeps happening, contact your administrator.",
    retry: "Try again",
  },
} as const;

function chooseCopy() {
  if (typeof document === "undefined") return COPY[DEFAULT_LOCALE === "mn" ? "mn" : "en"];
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_KEY}=([^;]*)`));
  // Only the two languages this file speaks; every other locale falls back to
  // Mongolian, which is the deployment's default.
  return match?.[1] === "en" ? COPY.en : COPY.mn;
}

/**
 * The colours, as a stylesheet rather than inline values, because inline styles
 * cannot ask about the colour scheme. A reader in dark mode used to be thrown
 * from a dark page onto a white one at the exact moment something broke.
 *
 * `html.dark` mirrors what public/theme-init.js would have set from the saved
 * preference; the media query covers "system" and a reader with nothing saved.
 * The values are the light and dark tokens from globals.css, which is not
 * loaded here (see above).
 */
const STYLE = `
  :root { --bg:#f9fafc; --fg:#11161e; --muted:#5e646c; --btn:#0064e1; --on-btn:#ffffff; color-scheme: light; }
  html.dark { --bg:#0a0d12; --fg:#f0f2f5; --muted:#8e929a; --btn:#5b9dff; --on-btn:#0b1220; color-scheme: dark; }
  @media (prefers-color-scheme: dark) {
    html:not(.light) { --bg:#0a0d12; --fg:#f0f2f5; --muted:#8e929a; --btn:#5b9dff; --on-btn:#0b1220; color-scheme: dark; }
  }
  button:focus-visible { outline: 2px solid var(--btn); outline-offset: 2px; }
`;

/** The saved mode, if any: "light" | "dark" | "" (system, or unreadable). */
function savedMode(): string {
  try {
    const saved = JSON.parse(window.localStorage.getItem("gerege_theme") || "null");
    return saved?.mode === "light" || saved?.mode === "dark" ? saved.mode : "";
  } catch {
    return "";
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = chooseCopy();
  const mode = typeof window === "undefined" ? "" : savedMode();
  return (
    // suppressHydrationWarning: the class comes from localStorage, which the
    // server rendering of this boundary cannot read.
    <html lang={copy.lang} className={mode || undefined} suppressHydrationWarning>
      <head>
        <style>{STYLE}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "var(--bg)",
          color: "var(--fg)",
          font: "400 14px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main role="alert" style={{ maxWidth: "34rem" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 600 }}>{copy.title}</h1>
          <p style={{ margin: "0 0 20px", color: "var(--muted)" }}>{copy.body}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: "8px",
              background: "var(--btn)",
              color: "var(--on-btn)",
              font: "500 14px/1 system-ui, sans-serif",
              padding: "12px 18px",
              minHeight: "44px",
              cursor: "pointer",
            }}
          >
            {copy.retry}
          </button>
          {error.digest && (
            <p style={{ marginTop: "20px", font: "400 12px/1.5 ui-monospace, monospace", color: "var(--muted)" }}>
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
