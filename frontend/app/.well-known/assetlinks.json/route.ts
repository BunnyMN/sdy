/**
 * Digital Asset Links — Android App Links for the Android member app
 * (native-apps/sdy-android), the counterpart of apple-app-site-association.
 *
 * Android fetches https://<domain>/.well-known/assetlinks.json when the app is
 * installed and, if this file names the app's package and signing certificate,
 * opens these links in the app instead of the browser (AndroidManifest.xml):
 *
 *   /auth/eid/callback?app=android  eID Mongolia returns the citizen here.
 *   /member/check-in                A check-in QR printed for an event.
 *
 * The certificate fingerprints are the deployment's, read at request time
 * (ANDROID_CERT_SHA256, comma-separated, passed through docker-compose.prod.yml):
 * Google Play's app-signing key from Play Console → Setup → App integrity, and
 * the upload key if builds are also installed outside Play. Unset means this
 * deployment has no Android app, and the honest answer is 404.
 *
 * Android's rules: served at exactly this address over https, application/json,
 * no redirect.
 */

export const dynamic = "force-dynamic";

const PACKAGE_NAME = "mn.esdy.member";

// "AB:CD:…" — 32 colon-separated upper-case hex pairs. Anything else is a typo
// in the deployment file, answered as "not configured" rather than published.
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (prints.length === 0 || !prints.every((p) => SHA256.test(p))) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: PACKAGE_NAME, sha256_cert_fingerprints: prints },
    },
  ];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}
