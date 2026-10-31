"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { Brand } from "@/lib/brand";
import styles from "./sdy-landing.module.css";

const links = [
  ["#features", "Боломжууд"],
  ["#how-it-works", "Хэрхэн элсэх вэ"],
  ["#questions", "Түгээмэл асуулт"],
  ["#feedback", "Санал хүсэлт"],
] as const;

/* The stock SDY mark is a 512px, 173 KB picture drawn at 52px. The header
   takes the 104px (2x) copy beside it; a deployment that named its own logo
   keeps it. */
const SDY_LOGO = "/sdy/logo.png";
const SDY_LOGO_SMALL = "/sdy/logo-104.webp";

export default function SdyLandingHeader({ brand }: { brand: Brand }) {
  const { resolvedMode, toggleMode } = useTheme();
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const themeLabel = resolvedMode === "dark" ? "Гэрэлтэй горимд шилжих" : "Бараан горимд шилжих";
  const ThemeIcon = resolvedMode === "dark" ? Sun : Moon;

  // A tap anywhere else closes the menu, as every other menu on a phone does.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label={`${brand.name} — Нүүр`}>
          {/* Runtime brand assets can be local or hosted by the deployment. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoUrl === SDY_LOGO ? SDY_LOGO_SMALL : brand.logoUrl} width={52} height={52} alt="" decoding="async" />
          <span><strong>{brand.shortName}</strong><small>Гишүүний цахим систем</small></span>
        </Link>
        <nav className={styles.desktopNav} aria-label="Үндсэн цэс">
          {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div className={styles.headerActions}>
          <button type="button" className={`${styles.iconButton} ${styles.headerTheme}`} onClick={toggleMode} aria-label={themeLabel}>
            <ThemeIcon aria-hidden="true" />
          </button>
          {/* One link, two lengths: the full phrase where there is room, a
              single word on a phone — the way in stays in the header. */}
          <Link href="/login?next=%2Fmember" className={`${styles.button} ${styles.headerLogin}`}>
            <span className={styles.loginLong}>eID-ээр нэвтрэх</span><span className={styles.loginShort}>Нэвтрэх</span>
          </Link>
          <details ref={menu} className={styles.mobileMenu} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
            if (event.key === "Escape" && menu.current?.open) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}>
            <summary className={styles.iconButton} aria-label={open ? "Цэс хаах" : "Цэс нээх"} data-menu-toggle="">
              {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </summary>
            <nav aria-label="Гар утасны цэс" onClick={event => {
              if (menu.current && (event.target as Element).closest("a")) menu.current.open = false;
            }}>
              {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
              <Link href="/login?next=%2Fmember">eID-ээр нэвтрэх</Link>
              <button type="button" className={styles.menuTheme} onClick={toggleMode}>
                <ThemeIcon aria-hidden="true" /> {themeLabel}
              </button>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
