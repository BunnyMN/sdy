import type { MetadataRoute } from "next";

import { publicPagesFromEnv, siteOriginFromEnv } from "@/lib/siteOrigin";

export const dynamic = "force-dynamic";

/** The public pages only — see lib/siteOrigin.ts. Empty when the deployment's address is unknown. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOriginFromEnv();
  if (!origin) return [];
  return publicPagesFromEnv().map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
