import { brandFromEnv } from "./brandEnv";
import { SECTION_PATHS } from "./landing";

/**
 * The address this deployment is published at, for the few things that must
 * name it absolutely: Open Graph images, the sitemap, robots.txt.
 *
 * `PUBLIC_ORIGIN` when the deployment says so (the API reads the same
 * variable); SDY's own address when the brand is SDY and nobody said; otherwise
 * nothing — a guessed origin in a sitemap is worse than no sitemap. Server-side
 * only, for the reason brandFromEnv is.
 */
export function siteOriginFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = (env.PUBLIC_ORIGIN ?? "").trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* A malformed value is the same as none. */
    }
  }
  return brandFromEnv(env).shortName === "SDY" ? "https://e-sdy.mn" : undefined;
}

/**
 * The pages a stranger may read, and so the only ones worth indexing. SDY's
 * front page carries its sections inline (the old section addresses redirect
 * into it), and the privacy and support pages exist for SDY's store listing.
 */
export function publicPagesFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return brandFromEnv(env).shortName === "SDY" ? ["/", "/privacy", "/support"] : ["/", ...SECTION_PATHS];
}
