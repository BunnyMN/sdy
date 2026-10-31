/**
 * Apple App Site Association — Universal Links for the iOS member app.
 *
 * iOS fetches https://<domain>/.well-known/apple-app-site-association when the
 * app is installed (through Apple's CDN) and opens the listed paths in the app
 * instead of Safari:
 *
 *   /auth/eid/callback?app=ios   eID Mongolia returns the citizen here after
 *                                they approve in the eID app. The `app=ios`
 *                                query keeps the web sign-in (same path, no
 *                                query) in the browser.
 *   /member/check-in             A check-in QR printed for an event.
 *
 * Apple's rules, which is why this is a route handler and not a file in public/:
 * the address has no extension, the answer must be application/json, must be
 * served directly (no redirect) over https, and must be under 128 KB.
 *
 * The team id is the deployment's, read at request time (APPLE_TEAM_ID, passed
 * through docker-compose.prod.yml). Unset means this deployment has no iOS app,
 * and the honest answer is 404 — an association naming somebody else's team, or
 * an empty one, would be cached by Apple's CDN as if it were true.
 *
 * Proxy (proxy.ts) leaves this path alone on the member host: it redirects only
 * `/` and `/login` on device-line hosts and only acts on the control-plane host.
 * nginx must send /.well-known/ to this server, except acme-challenge.
 */

// Read at request time: the image is built once and the team id is a
// deployment setting, so a build-time prerender would bake in "unset".
export const dynamic = "force-dynamic";

const APP_BUNDLE_ID = "mn.esdy.member";

// Apple team ids are ten upper-case letters and digits. Anything else is a
// typo in the deployment file, answered as "not configured" rather than
// published.
const TEAM_ID = /^[A-Z0-9]{10}$/;

export function GET() {
  const team = (process.env.APPLE_TEAM_ID || "").trim();
  if (!TEAM_ID.test(team)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${team}.${APP_BUNDLE_ID}`],
          components: [
            { "/": "/auth/eid/callback", "?": { app: "ios" } },
            { "/": "/member/check-in" },
          ],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Apple's CDN refetches on its own schedule; an hour keeps a corrected
      // team id from waiting on a stale intermediate cache for long.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
