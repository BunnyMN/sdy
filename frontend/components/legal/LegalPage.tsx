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
 * SDY-ийн холбоо барих и-мэйл — /privacy, /support хоёулаа эндээс уншина.
 *
 * Анхдагч `privacy@e-sdy.mn` нь ОДООГООР ЗАХИДАЛ ХҮЛЭЭН АВАХГҮЙ: e-sdy.mn
 * домэйнд MX бичлэг байхгүй (2026-11-17-нд шалгасан). SDY бодит хаягаа гаргах
 * хүртэл серверийн орчинд `LEGAL_CONTACT_EMAIL`-ийг хүлээн авдаг хаягаар
 * тохируулна (docker-compose.prod.yml → frontend, deploy.yml); эсвэл
 * e-sdy.mn-д MX нэмж энэ хаягийг ажилладаг болгоно. Дэлгэрэнгүй: docs/MZH.md.
 *
 * Layout нь force-dynamic тул утга хүсэлт бүрт уншигдана — image дахин
 * бүтээх шаардлагагүй.
 */
export const SDY_CONTACT_EMAIL = "privacy@e-sdy.mn";

export function contactEmail(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.LEGAL_CONTACT_EMAIL ?? "").trim();
  // Only something that is an address: this lands in a mailto: link.
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(configured) ? configured : SDY_CONTACT_EMAIL;
}

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
  const email = contactEmail();
  return (
    <>
      <a href={`mailto:${email}`}>{email}</a>
    </>
  );
}

export { styles as legalStyles };
