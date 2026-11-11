#!/usr/bin/env python3
"""E-sdy (mn.esdy.member) in App Store Connect, from the command line.

No SDK: this signs its own ES256 JWT with `cryptography` and calls the REST
API. The private key never enters git; it lives at
~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 (or ASC_KEY_PATH).

    pip3 install cryptography                      # once per machine

    scripts/asc.py versions                        # App Store versions and their state
    scripts/asc.py builds                          # what has been uploaded lately
    scripts/asc.py wait-build 13                   # until build 13 is VALID (processing)
    scripts/asc.py create-version 1.1.2            # a new PREPARE_FOR_SUBMISSION version
    scripts/asc.py attach-build 1.1.2 13           # put build 13 on version 1.1.2
    scripts/asc.py whats-new 1.1.2 "• …"          # release notes, every locale
    scripts/asc.py review-notes 1.1.2              # contact + demo account from the last version,
                                                   #   notes from AppStore/review-notes.txt
    scripts/asc.py submit 1.1.2                    # send it for App Review
    scripts/asc.py release 1.1.2                   # what goes live (state, build) — read only

Adapted from the helper in the user's `san` project (scripts/asc.py) so a
release needs nothing outside this repo.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from base64 import urlsafe_b64encode
from pathlib import Path

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, utils
except ImportError:  # pragma: no cover - a fresh Mac
    raise SystemExit("cryptography алга: pip3 install cryptography")

# Identifiers, not secrets: the key ID and issuer name the key; the .p8 file is the secret.
KEY_ID = os.environ.get("ASC_KEY_ID", "QX4Z356N44")
ISSUER_ID = os.environ.get("ASC_ISSUER_ID", "9dc31afc-853a-40ca-8016-a4e6595ab2bc")
APP_ID = os.environ.get("ASC_APP_ID", "6827076210")  # E-sdy
API = "https://api.appstoreconnect.apple.com/v1"
NOTES_FILE = Path(__file__).resolve().parent.parent / "AppStore" / "review-notes.txt"


def _b64(raw: bytes) -> str:
    return urlsafe_b64encode(raw).rstrip(b"=").decode()


def key_path() -> str:
    return os.path.expanduser(os.environ.get(
        "ASC_KEY_PATH", f"~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8"))


def token() -> str:
    """A short-lived ES256 JWT, which is the only auth this API takes."""
    path = key_path()
    if not os.path.exists(path):
        raise SystemExit(f"API түлхүүр олдсонгүй: {path}\n"
                         "RELEASE.md → «Түлхүүрийг шилжүүлэх» хэсгийг үзнэ үү.")
    with open(path, "rb") as fh:
        key = serialization.load_pem_private_key(fh.read(), password=None)
    header = {"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}
    now = int(time.time())
    payload = {"iss": ISSUER_ID, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"}
    signing_input = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(payload).encode())}".encode()
    der = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = utils.decode_dss_signature(der)
    return f"{signing_input.decode()}.{_b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


def call(method: str, path: str, body=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token())
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} on {method} {path}\n{e.read().decode()}", file=sys.stderr)
        raise SystemExit(1)


def find_version(number: str):
    for v in call("GET", f"/apps/{APP_ID}/appStoreVersions?limit=50")["data"]:
        if v["attributes"]["versionString"] == number:
            return v
    return None


def need_version(number: str):
    v = find_version(number)
    if not v:
        raise SystemExit(f"{number} хувилбар алга — эхлээд create-version")
    return v


def find_build(number: str):
    data = call("GET", f"/builds?filter[app]={APP_ID}&filter[version]={number}")["data"]
    return data[0] if data else None


def cmd_builds(_args):
    for b in call("GET", f"/builds?filter[app]={APP_ID}&limit=10&sort=-uploadedDate")["data"]:
        a = b["attributes"]
        print(f"{a['version']:>6}  {a['processingState']:<12} {a.get('uploadedDate', '')}  {b['id']}")


def cmd_versions(_args):
    for v in call("GET", f"/apps/{APP_ID}/appStoreVersions?limit=20")["data"]:
        a = v["attributes"]
        print(f"{a['versionString']:>6}  {a['appStoreState']:<28} {v['id']}")


def cmd_wait_build(args):
    deadline = time.time() + args.minutes * 60
    while True:
        build = find_build(args.build)
        state = build["attributes"]["processingState"] if build else "NOT_YET_LISTED"
        print(f"build {args.build}: {state}", flush=True)
        if state == "VALID":
            return
        if state in ("FAILED", "INVALID"):
            raise SystemExit(f"build {args.build} {state} — App Store Connect-ийн имэйлийг шалгана уу")
        if time.time() > deadline:
            raise SystemExit("хугацаа дууслаа; дахин ажиллуулна уу")
        time.sleep(30)


def cmd_create_version(args):
    if find_version(args.version):
        print(f"{args.version} аль хэдийн бий")
        return
    out = call("POST", "/appStoreVersions", {"data": {
        "type": "appStoreVersions",
        "attributes": {"platform": "IOS", "versionString": args.version},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}},
    }})
    print("created", out["data"]["id"])


def cmd_attach_build(args):
    version = need_version(args.version)
    build = find_build(args.build)
    if not build:
        raise SystemExit(f"build {args.build} олдсонгүй — боловсруулагдаж байна уу? (wait-build)")
    state = build["attributes"]["processingState"]
    if state != "VALID":
        raise SystemExit(f"build {args.build} {state}, VALID биш")
    call("PATCH", f"/appStoreVersions/{version['id']}/relationships/build",
         {"data": {"type": "builds", "id": build["id"]}})
    print(f"build {args.build} → {args.version}")


def cmd_whats_new(args):
    version = need_version(args.version)
    for loc in call("GET", f"/appStoreVersions/{version['id']}/appStoreVersionLocalizations")["data"]:
        call("PATCH", f"/appStoreVersionLocalizations/{loc['id']}",
             {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"],
                       "attributes": {"whatsNew": args.text}}})
        print("whatsNew →", loc["attributes"]["locale"])


def review_detail(version):
    try:
        return call("GET", f"/appStoreVersions/{version['id']}/appStoreReviewDetail")["data"]
    except SystemExit:
        return None


def cmd_review_notes(args):
    """Contact and demo account from the newest other version that has them;
    notes from AppStore/review-notes.txt (kept in git, no password in it)."""
    target = need_version(args.version)
    source = None
    for v in call("GET", f"/apps/{APP_ID}/appStoreVersions?limit=20")["data"]:
        if v["id"] == target["id"]:
            continue
        d = review_detail(v)
        if d and d["attributes"].get("demoAccountName"):
            source = d["attributes"]
            break
    if not source:
        raise SystemExit("өмнөх хувилбарт демо бүртгэл олдсонгүй — App Store Connect-д гараар оруулна уу")
    keep = ("contactFirstName", "contactLastName", "contactPhone", "contactEmail",
            "demoAccountName", "demoAccountPassword", "demoAccountRequired")
    attrs = {k: source.get(k) for k in keep}
    attrs["notes"] = NOTES_FILE.read_text().strip()
    existing = review_detail(target)
    if existing:
        call("PATCH", f"/appStoreReviewDetails/{existing['id']}",
             {"data": {"type": "appStoreReviewDetails", "id": existing["id"], "attributes": attrs}})
    else:
        call("POST", "/appStoreReviewDetails", {"data": {
            "type": "appStoreReviewDetails", "attributes": attrs,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": target["id"]}}},
        }})
    print(f"review notes → {args.version} (демо: {attrs['demoAccountName']})")


def cmd_submit(args):
    version = need_version(args.version)
    sub = call("POST", "/reviewSubmissions", {"data": {
        "type": "reviewSubmissions",
        "attributes": {"platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}},
    }})["data"]
    call("POST", "/reviewSubmissionItems", {"data": {
        "type": "reviewSubmissionItems",
        "relationships": {
            "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub["id"]}},
            "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version["id"]}},
        },
    }})
    call("PATCH", f"/reviewSubmissions/{sub['id']}",
         {"data": {"type": "reviewSubmissions", "id": sub["id"], "attributes": {"submitted": True}}})
    print(f"{args.version} App Review-д илгээгдлээ (submission {sub['id']})")


def cmd_release(args):
    version = need_version(args.version)
    a = version["attributes"]
    build = call("GET", f"/appStoreVersions/{version['id']}/build").get("data")
    print(f"{args.version}: {a['appStoreState']}, build {build['attributes']['version'] if build else '—'}, "
          f"releaseType {a.get('releaseType')}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("builds").set_defaults(fn=cmd_builds)
    sub.add_parser("versions").set_defaults(fn=cmd_versions)
    wb = sub.add_parser("wait-build"); wb.add_argument("build"); wb.add_argument("--minutes", type=int, default=40); wb.set_defaults(fn=cmd_wait_build)
    cv = sub.add_parser("create-version"); cv.add_argument("version"); cv.set_defaults(fn=cmd_create_version)
    ab = sub.add_parser("attach-build"); ab.add_argument("version"); ab.add_argument("build"); ab.set_defaults(fn=cmd_attach_build)
    wn = sub.add_parser("whats-new"); wn.add_argument("version"); wn.add_argument("text"); wn.set_defaults(fn=cmd_whats_new)
    rn = sub.add_parser("review-notes"); rn.add_argument("version"); rn.set_defaults(fn=cmd_review_notes)
    sb = sub.add_parser("submit"); sb.add_argument("version"); sb.set_defaults(fn=cmd_submit)
    rl = sub.add_parser("release"); rl.add_argument("version"); rl.set_defaults(fn=cmd_release)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
