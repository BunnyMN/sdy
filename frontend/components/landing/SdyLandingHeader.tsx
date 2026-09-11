"use client";

import Link from "next/link";
import { useRef } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { Brand } from "@/lib/brand";
import styles from "./sdy-landing.module.css";

const links = [
  ["#features", "Боломжууд"],
  ["#how-it-works", "Хэрхэн элсэх вэ"],
  ["#questions", "Түгээмэл асуулт"],
] as const;

export default function SdyLandingHeader({ brand }: { brand: Brand }) {
  const { resolvedMode, toggleMode } = useTheme();
  const menu = useRef<HTMLDetailsElement>(null);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label={`${brand.name} — Нүүр`}>
          {/* Runtime brand assets can be local or hosted by the deployment. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoUrl} width={40} height={40} alt="" />
          <span><strong>{brand.shortName}</strong><small>Гишүүний цахим систем</small></span>
        </Link>
        <nav className={styles.desktopNav} aria-label="Үндсэн цэс">
          {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div className={styles.headerActions}>
          <button className={styles.iconButton} onClick={toggleMode}
            aria-label={resolvedMode === "dark" ? "Гэрэлтэй горимд шилжих" : "Бараан горимд шилжих"}>
            {resolvedMode === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <Link href="/login?next=%2Fmember" className={`${styles.button} ${styles.headerLogin}`}>e-ID-аар нэвтрэх</Link>
          <details ref={menu} className={styles.mobileMenu} onKeyDown={event => {
            if (event.key === "Escape" && menu.current?.open) {
              menu.current.open = false;
              menu.current.querySelector("summary")?.focus();
            }
          }}>
            <summary className={styles.iconButton} aria-label="Цэс нээх"><Menu aria-hidden="true" /></summary>
            <nav aria-label="Гар утасны цэс" onClick={() => { if (menu.current) menu.current.open = false; }}>
              {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
              <Link href="/login?next=%2Fmember">e-ID-аар нэвтрэх</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
