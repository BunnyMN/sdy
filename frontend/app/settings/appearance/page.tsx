"use client";

import { Check, Moon, Monitor, Palette, RotateCcw, Sun } from "lucide-react";
import { Accent, ColorMode, Density, DesignTheme, useTheme } from "@/lib/theme";
import { DEFAULT_LOCALES, LOCALES, TranslationKey, useI18n } from "@/lib/i18n";

// Every label resolves through the dictionary, so this screen switches with the
// rest of the app instead of carrying its own inline translations.
const modes: { value: ColorMode; label: TranslationKey; icon: typeof Sun }[] = [
  { value: "light", label: "appearance.mode.light", icon: Sun },
  { value: "dark", label: "appearance.mode.dark", icon: Moon },
  { value: "system", label: "appearance.mode.system", icon: Monitor },
];

// No colour values here. The swatches used to carry their own hex codes, and
// they had drifted from globals.css — neutral showed #64748b while the theme
// painted #475569, and none of them changed in dark mode where the accent
// does. Each swatch now sits under `data-accent-preview`, which globals.css
// answers with that accent's real tokens for the current mode.
const accents: { value: Accent; label: TranslationKey }[] = [
  { value: "neutral", label: "appearance.accent.neutral" },
  { value: "cobalt", label: "appearance.accent.cobalt" },
  { value: "teal", label: "appearance.accent.teal" },
  { value: "violet", label: "appearance.accent.violet" },
  { value: "emerald", label: "appearance.accent.emerald" },
];

// The two designs differ in what paints the top bar: the original fills it
// with the brand (or the accent's saturated fill), the gerege design leaves
// it the chrome colour. Tokens, so the preview follows mode and accent.
const styles: { value: DesignTheme; name: TranslationKey; hint: TranslationKey; top: string; side: string }[] = [
  { value: "original", name: "appearance.style.original", hint: "appearance.view.original_hint", top: "var(--brand-primary, var(--gerege-accent-strong))", side: "var(--gerege-chrome)" },
  { value: "gerege", name: "appearance.style.gerege", hint: "appearance.view.gerege_hint", top: "var(--gerege-chrome)", side: "var(--gerege-bg)" },
];

/**
 * A choice among cards, as a real radio group.
 *
 * They were buttons with a tick drawn on the chosen one, so a screen reader
 * heard five unrelated buttons and no "selected". A native radio inside each
 * label gives the role, the checked state and arrow-key movement for nothing;
 * the input is visually hidden and the label draws the focus ring for it.
 */
const radioCard =
  "cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

const densities: { value: Density; label: TranslationKey }[] = [
  { value: "comfortable", label: "appearance.density.comfortable" },
  { value: "compact", label: "appearance.density.compact" },
];

export default function AppearanceSettingsPage() {
  const { t, availableLocales, setLocaleEnabled } = useI18n();
  const theme = useTheme();

  return (
    <div className="w-full space-y-6">
      <div className="border-b border-line pb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Palette className="w-6 h-6 text-accent" />
            {t("appearance.view.title")}
          </h1>
          <p className="text-sm text-muted mt-1">{t("appearance.view.subtitle")}</p>
        </div>
        <button type="button" onClick={theme.resetTheme} className="min-h-11 flex items-center gap-2 px-3 py-2 text-sm border border-line rounded-lg bg-surface hover:bg-surface-hover text-muted">
          <RotateCcw aria-hidden="true" className="w-4 h-4" />
          {t("appearance.action.reset")}
        </button>
      </div>

      <section className="bg-surface border border-line rounded-lg p-5">
        <h2 className="font-semibold text-base">{t("appearance.field.languages")}</h2>
        <p className="text-sm text-muted mt-1">{t("appearance.view.languages_hint")}</p>
        <p className="text-xs text-muted mt-1 mb-4">{t("appearance.view.languages_partial")}</p>
        <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
          {LOCALES.map((option) => {
            const isDefault = DEFAULT_LOCALES.includes(option.code);
            const isOn = availableLocales.includes(option.code);
            return (
              <li key={option.code} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm font-medium text-foreground min-w-0 truncate">{option.label}</span>
                <span className="text-2xs uppercase tracking-wider text-muted">{option.code}</span>
                <span className="ml-auto">
                  {isDefault ? (
                    // Not a disabled control: there is nothing to press, so the
                    // state is stated rather than shown as a dead switch.
                    <span className="text-xs text-muted">{t("appearance.state.language_always")}</span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={option.label}
                      onClick={() => setLocaleEnabled(option.code, !isOn)}
                      className={`relative w-11 h-6 rounded-full transition ${isOn ? "bg-accent" : "bg-line-strong"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface shadow transition-all ${isOn ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-surface border border-line rounded-lg p-5">
        <h2 id="appearance-style" className="font-semibold text-base">{t("appearance.field.theme_style")}</h2>
        <p className="text-sm text-muted mt-1 mb-4">{t("appearance.view.theme_style_hint")}</p>
        <div role="radiogroup" aria-labelledby="appearance-style" className="grid sm:grid-cols-2 gap-4">
          {styles.map((item) => (
            <label key={item.value} className={`${radioCard} block overflow-hidden rounded-xl border text-left transition ${theme.design === item.value ? "border-accent ring-2 ring-[color-mix(in_srgb,var(--gerege-blue)_15%,transparent)]" : "border-line hover:border-input"}`}>
              <input type="radio" name="appearance-style" value={item.value} checked={theme.design === item.value} onChange={() => theme.updateTheme({ design: item.value })} className="sr-only" />
              <span aria-hidden="true" className="block h-12 border-b border-line" style={{ background: item.top }}>
                <span className="block w-1/3 h-full border-r border-line" style={{ background: item.side }} />
              </span>
              <span className="flex items-center gap-3 p-4 bg-surface">
                <span aria-hidden="true" className="w-3 h-8 rounded-full bg-accent" />
                <span className="flex-1">
                  <strong className="block text-sm">{t(item.name)}</strong>
                  <span className="block text-xs text-muted mt-0.5">{t(item.hint)}</span>
                </span>
                {theme.design === item.value && <Check aria-hidden="true" className="w-4 h-4 text-accent" />}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-lg p-5">
        <h2 id="appearance-mode" className="font-semibold text-base">{t("appearance.field.color_mode")}</h2>
        <p className="text-sm text-muted mt-1 mb-4">{t("appearance.view.color_mode_hint")}</p>
        <div role="radiogroup" aria-labelledby="appearance-mode" className="grid sm:grid-cols-3 gap-3">
          {modes.map(({ value, label, icon: Icon }) => (
            <label key={value} className={`${radioCard} relative flex items-center gap-3 p-4 rounded-lg border text-left transition ${theme.mode === value ? "border-accent bg-accent-soft" : "border-line hover:border-input"}`}>
              <input type="radio" name="appearance-mode" value={value} checked={theme.mode === value} onChange={() => theme.updateTheme({ mode: value })} className="sr-only" />
              <Icon aria-hidden="true" className="w-5 h-5 text-accent" />
              <span className="font-medium text-sm">{t(label)}</span>
              {theme.mode === value && <Check aria-hidden="true" className="absolute right-3 w-4 h-4 text-accent" />}
            </label>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-lg p-5">
        <h2 id="appearance-accent" className="font-semibold text-base">{t("appearance.field.accent")}</h2>
        <p className="text-sm text-muted mt-1 mb-4">{t("appearance.view.accent_hint")}</p>
        <div role="radiogroup" aria-labelledby="appearance-accent" className="grid sm:grid-cols-2 gap-3">
          {accents.map((accent) => (
            <label key={accent.value} className={`${radioCard} flex items-center gap-3 p-3 rounded-lg border text-left ${theme.accent === accent.value ? "border-accent bg-accent-soft" : "border-line hover:border-input"}`}>
              <input type="radio" name="appearance-accent" value={accent.value} checked={theme.accent === accent.value} onChange={() => theme.updateTheme({ accent: accent.value })} className="sr-only" />
              <span aria-hidden="true" data-accent-preview={accent.value} className="w-8 h-8 rounded-lg shadow-inner bg-accent" />
              <span className="font-medium text-sm flex-1">{t(accent.label)}</span>
              {theme.accent === accent.value && <Check aria-hidden="true" className="w-4 h-4 text-accent" />}
            </label>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-lg p-5">
        <h2 id="appearance-density" className="font-semibold text-base">{t("appearance.field.density")}</h2>
        <div role="radiogroup" aria-labelledby="appearance-density" className="mt-4 inline-flex rounded-lg border border-line p-1 bg-surface-2">
          {densities.map(({ value, label }) => (
            <label key={value} className={`${radioCard} min-h-11 inline-flex items-center px-4 py-2 rounded-md text-sm font-medium ${theme.density === value ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}>
              <input type="radio" name="appearance-density" value={value} checked={theme.density === value} onChange={() => theme.updateTheme({ density: value })} className="sr-only" />
              {t(label)}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
