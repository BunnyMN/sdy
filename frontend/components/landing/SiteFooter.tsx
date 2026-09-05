"use client";

import {useI18n} from "@/lib/i18n";
import {useBrand} from "@/lib/brandContext";
import {DEFAULT_BRAND} from "@/lib/brand";

export default function SiteFooter() {
  const {t} = useI18n();
  const brand = useBrand();

  // A deployment standing up under its own name says what it stands on. This
  // deployment is that thing, so it says nothing — a footer reading "Gerege
  // Nexus · Powered by Gerege Nexus" would be a line explaining itself to
  // itself.
  const rebranded = brand.name !== DEFAULT_BRAND.name;

  return (
    <footer className="gp-footer">
      {/* A deployment under its own name holds its own copyright line; the
          platform is credited by the "powered by" line beside it. */}
      <span>{rebranded ? `© ${new Date().getFullYear()} ${brand.name}` : `© 2026 Gerege Systems · ${brand.name}`}</span>
      <span>{t("website.message.footer_note")}</span>
      {rebranded && <span>{t("website.message.powered_by")}</span>}
    </footer>
  );
}
