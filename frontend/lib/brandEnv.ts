import { DEFAULT_BRAND, type Brand } from "./brand";

/**
 * Reads the brand from the environment. Server-side only — `process.env` on the
 * client holds nothing but what the build inlined, which is the whole point.
 */
export function brandFromEnv(env: NodeJS.ProcessEnv = process.env): Brand {
  return {
    name: text(env.BRAND_NAME) || DEFAULT_BRAND.name,
    // A short name nobody supplied is the full name, not "Nexus": the default
    // pair belongs to the default brand, and inheriting half of it would put
    // this product's abbreviation under somebody else's icon.
    shortName: text(env.BRAND_SHORT_NAME) || text(env.BRAND_NAME) || DEFAULT_BRAND.shortName,
    description: text(env.BRAND_DESCRIPTION) || DEFAULT_BRAND.description,
    logoUrl: assetURL(text(env.BRAND_LOGO_URL)) || DEFAULT_BRAND.logoUrl,
    wordmarkUrl: assetURL(text(env.BRAND_WORDMARK_URL)),
    themeColor: hexColour(text(env.BRAND_THEME_COLOR)) || DEFAULT_BRAND.themeColor,
    accentColor: hexColour(text(env.BRAND_ACCENT_COLOR)) || DEFAULT_BRAND.accentColor,
    iconUrl: assetURL(text(env.BRAND_ICON_URL)),
    maskableIconUrl: assetURL(text(env.BRAND_MASKABLE_ICON_URL)),
    // Falls back to the platform's manual rather than to nothing: a menu item
    // that leads nowhere is worse than one that leads to the general book.
    docsUrl: assetURL(text(env.BRAND_DOCS_URL)) || DEFAULT_BRAND.docsUrl,
  };
}

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * A logo address, or nothing.
 *
 * The value is written into `src` on an image tag, so the shapes it may take
 * are named rather than trusted: a path on this host, or an absolute http(s)
 * URL. Everything else — `javascript:` first among them — is not a location a
 * deployment file has any reason to hold, and refusing it here means a
 * mistyped or tampered environment costs a logo rather than a session.
 */
function assetURL(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https?:\/\/\S+$/i.test(value)) return value;
  return "";
}

/**
 * A CSS hex colour, or nothing. It is emitted in a meta tag and read by the
 * launcher; anything else there is a colour the browser silently ignores, and
 * finding that out from a screenshot is worse than falling back visibly.
 */
function hexColour(value: string): string {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : "";
}

/**
 * The palette a branded deployment paints with, as CSS custom properties for
 * <html>. Nothing for the default deployment: its palette is written in
 * globals.css as the fallbacks of these very properties, and setting them to
 * the same values would only be a second place for that palette to live.
 *
 * The derived shades are computed here rather than with `color-mix` in the
 * stylesheet so that the stylesheet's fallbacks can stay the exact hex values
 * the default deployment has always used.
 */
export function brandCSSVariables(brand: Brand): Record<string, string> {
  if (brand.themeColor === DEFAULT_BRAND.themeColor && !brand.accentColor) return {};
  const primary = brand.themeColor;
  const accent = brand.accentColor || "#f2bd42";
  return {
    "--brand-primary": primary,
    "--brand-primary-ink": primary,
    "--brand-primary-hover": mix(primary, "#000000", 0.12),
    "--brand-primary-soft": mix(primary, "#ffffff", 0.9),
    "--brand-accent": accent,
    "--brand-accent-h": mix(accent, "#ffffff", 0.18),
  };
}

/** `amount` of `into` mixed into `colour`, both as #rrggbb (or #rgb). */
function mix(colour: string, into: string, amount: number): string {
  const a = rgb(colour);
  const b = rgb(into);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((x) => x + x).join("");
  h = h.slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
