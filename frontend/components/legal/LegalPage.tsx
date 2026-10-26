import Link from "next/link";
import type { ReactNode } from "react";

import { brandFromEnv } from "@/lib/brandEnv";
import styles from "./legal.module.css";

/**
 * Нууцлалын бодлого (/privacy), тусламж (/support) хоёрын нийтлэг хүрээ.
 *
 * Хоёулаа нэвтрээгүй хүнд нээлттэй (lib/publicRoutes.ts) бөгөөд App Store
 * Connect-д iOS гишүүний аппын «Privacy Policy URL», «Support URL» болж
 * бүртгэгдэнэ — тиймээс ажлын бүрхүүлгүй, нэг баганатай, утсан дээр уншихад
 * зориулсан энгийн хуудас.
 */

/**
 * SDY-ийн холбоо барих и-мэйл.
 *
 * TODO(SDY): ОРЛУУЛАХ ЁСТОЙ PLACEHOLDER. Энэ хаяг одоогоор баталгаажаагүй —
 * SDY-ийн бодит, хүлээн авдаг хаягаар солиод, App Store Connect-д илгээхээс
 * өмнө ажиллаж буйг шалгана. /privacy, /support хоёр хоёулаа эндээс уншдаг.
 */
export const SDY_CONTACT_EMAIL = "privacy@e-sdy.mn";

export function LegalPage({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  const brand = brandFromEnv();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label={`${brand.name} — Нүүр`}>
            {/* Runtime brand assets can be local or hosted by the deployment. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} width={40} height={40} alt="" />
            <span><strong>{brand.shortName}</strong><small>Гишүүний цахим систем</small></span>
          </Link>
          <nav className={styles.headerNav} aria-label="Хуудасны холбоос">
            <Link href="/privacy">Нууцлал</Link>
            <Link href="/support">Тусламж</Link>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.title}>
          <h1>{title}</h1>
          {lead ? <p>{lead}</p> : null}
        </div>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© {new Date().getFullYear()} {brand.shortName}</span>
          <nav aria-label="Доод холбоос">
            <Link href="/">Нүүр</Link>
            <Link href="/privacy">Нууцлалын бодлого</Link>
            <Link href="/support">Тусламж</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={id ? `${id}-title` : undefined}>
      <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
      {children}
    </section>
  );
}

export function ContactEmail() {
  return (
    <>
      <a href={`mailto:${SDY_CONTACT_EMAIL}`}>{SDY_CONTACT_EMAIL}</a>
    </>
  );
}

export { styles as legalStyles };
