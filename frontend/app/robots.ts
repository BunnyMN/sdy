import type { MetadataRoute } from "next";

import { siteOriginFromEnv } from "@/lib/siteOrigin";

// Per request: which address the sitemap lives at is the deployment's, not the
// build's (see app/layout.tsx).
export const dynamic = "force-dynamic";

/**
 * The front door and its public pages may be indexed; everything behind a
 * session, every identity handoff and the API may not. Disallowing them does
 * not protect them — the session does — it keeps sign-in screens and empty
 * member shells out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOriginFromEnv();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/cp",
        "/impersonate",
        "/kiosk",
        "/login",
        "/me",
        "/member",
        "/module",
        "/oauth",
        "/oauth2/",
        "/profile",
        "/settings",
        "/setup",
      ],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
