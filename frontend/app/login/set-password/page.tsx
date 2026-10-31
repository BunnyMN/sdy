"use client";

/**
 * Choosing a password from an invitation or a reset.
 *
 * The link that leads here was sent by the operator console through the
 * platform's verification service; this page is where it is spent. It is a
 * public route by necessity — somebody who cannot sign in is by definition not
 * signed in — and everything that makes it safe is on the server: the token is
 * single-use, short-lived, and stored only as a digest.
 *
 * The page checks the link before showing the form, because the alternative is
 * letting somebody type a password twice and then telling them the link
 * expired yesterday.
 */

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

import { apiBase } from "@/lib/apiBase";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { ErrorNote, Loading } from "@/components/ui";

export default function SetPasswordPage() {
  // useSearchParams needs a Suspense boundary in the app router; without it
  // the build refuses to prerender the route.
  return (
    <Suspense fallback={null}>
      <SetPassword />
    </Suspense>
  );
}

const MIN_LENGTH = 10;

function SetPassword() {
  const { t } = useI18n();
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [state, setState] = useState<"checking" | "ready" | "dead" | "done">("checking");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [failure, setFailure] = useState("");
  // Set by Save, not by typing: flagging the repeat field while somebody is
  // still halfway through typing it says "wrong" about a value they have not
  // finished giving.
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  // The server answers in English; the reader is told in their own language.
  const errorMessage = useErrorMessage({ fallback: "auth.message.password_failed" });

  const check = useCallback(async () => {
    if (!token) {
      setState("dead");
      return;
    }
    try {
      const response = await fetch(`${apiBase()}/auth/credential?token=${encodeURIComponent(token)}`);
      const body = await response.json();
      if (!body.valid) {
        setState("dead");
        return;
      }
      setEmail(body.email ?? "");
      setPurpose(body.purpose ?? "");
      setState("ready");
    } catch {
      setState("dead");
    }
  }, [token]);

  useEffect(() => {
    void check();
  }, [check]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== again) {
      setFailure(t("auth.message.password_mismatch"));
      setMismatch(true);
      return;
    }
    setBusy(true);
    setFailure("");
    setMismatch(false);
    try {
      const response = await fetch(`${apiBase()}/auth/credential/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
        setFailure(errorMessage({ status: response.status, code: body.code, message: body.error ?? "" }));
        return;
      }
      setState("done");
      // Straight to the sign-in screen: the password they have just chosen is
      // the one they are about to use, and every session the account had was
      // ended by the server a moment ago.
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-surface-2 px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-line p-6 space-y-4">
        <div className="flex items-center gap-2 text-foreground">
          <KeyRound aria-hidden="true" className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-semibold">
            {purpose === "invite" ? t("auth.view.set_password_invite") : t("auth.view.set_password_reset")}
          </h1>
        </div>

        {state === "checking" && <Loading label={t("auth.message.checking_link")} />}

        {state === "dead" && (
          <>
            <ErrorNote>{t("auth.message.link_dead")}</ErrorNote>
            <a href="/login" className="inline-block text-sm text-accent underline">{t("auth.callback.sign_in_again")}</a>
          </>
        )}

        {state === "done" && (
          <p role="status" className="text-sm rounded-lg bg-success-soft text-success border border-success-border px-3 py-2">
            {t("auth.message.password_saved")}
          </p>
        )}

        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted">{email}</p>

            {/* role="alert" because the message is written after the page has
                loaded, in response to Save. Without it a screen reader user
                presses the button, hears nothing, and has no way to learn the
                two passwords did not match. */}
            {failure && (
              <p
                id="password-failure"
                role="alert"
                className="text-sm rounded-lg bg-danger-soft text-danger border border-danger-border px-3 py-2"
              >
                {failure}
              </p>
            )}

            <label className="block text-sm">
              <span className="text-muted">{t("auth.field.new_password")}</span>
              <span className="relative mt-1 block">
                <input
                  type={reveal ? "text" : "password"}
                  autoComplete="new-password"
                  autoFocus
                  required
                  minLength={MIN_LENGTH}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setMismatch(false); }}
                  aria-describedby="password-length-hint"
                  className="w-full rounded-lg border border-input bg-surface text-foreground px-3 py-2 pe-11"
                />
                {/* One switch for both fields: someone checking what they typed
                    wants to compare the two. */}
                <button
                  type="button"
                  onClick={() => setReveal((value) => !value)}
                  aria-pressed={reveal}
                  aria-label={t(reveal ? "auth.action.hide_password" : "auth.action.show_password")}
                  title={t(reveal ? "auth.action.hide_password" : "auth.action.show_password")}
                  className="absolute inset-y-0 end-0 w-11 grid place-items-center text-muted hover:text-foreground"
                >
                  {reveal ? <EyeOff aria-hidden="true" className="w-4 h-4" /> : <Eye aria-hidden="true" className="w-4 h-4" />}
                </button>
              </span>
            </label>

            {/* The mismatch is a fact about this field, so it is this field
                that carries the invalid state and points at the message. */}
            <label className="block text-sm">
              <span className="text-muted">{t("auth.field.repeat_password")}</span>
              <input
                type={reveal ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                value={again}
                onChange={(event) => { setAgain(event.target.value); setMismatch(false); }}
                aria-invalid={mismatch || undefined}
                aria-describedby={
                  mismatch ? "password-failure password-length-hint" : "password-length-hint"
                }
                className="mt-1 w-full rounded-lg border border-input bg-surface text-foreground px-3 py-2"
              />
            </label>

            <p id="password-length-hint" className="text-xs text-muted">
              {t("auth.hint.password_length")}
            </p>

            <button
              type="submit"
              disabled={busy}
              aria-busy={busy || undefined}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-on-accent py-2.5 font-medium hover:bg-accent-strong disabled:opacity-60 transition"
            >
              {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
              {t(busy ? "auth.action.saving_password" : "auth.action.save_password")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
