"use client";

/**
 * Who may reach this console.
 *
 * Adding an operator used to mean a shell on the production host — the
 * bootstrap command, run as the database owner. This screen replaces that for
 * everybody after the first: a superadmin, with a second factor, leaving an
 * audit row.
 *
 * The handover panel appears once. The password and the authenticator's secret
 * are not stored anywhere they can be read back, so closing it without writing
 * them down means adding the account again.
 */

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Search, ShieldCheck, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { useAction } from "@/components/cp/Action";
import { useConsole } from "@/components/cp/Console";
import { Badge, Card, formatMoment, Table } from "@/components/cp/ui";
import { cp, StepUpRequired, type CreatedOperator, type OperatorSummary } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";
import { Banner, CopyButton, ErrorNote, Modal } from "@/components/ui";

const ROLES = ["superadmin", "operator", "support", "auditor"] as const;

export default function Operators() {
  const { t } = useI18n();
  const { operator: me } = useConsole();
  const action = useAction();
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  // The role each row's dropdown is showing, before it is applied. Picking a
  // role no longer opens the dialog by itself: a stray scroll-wheel over the
  // select, or an arrow key while tabbing through the row, used to ask to
  // demote somebody.
  const [pickedRoles, setPickedRoles] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState(false);
  const [handover, setHandover] = useState<CreatedOperator | null>(null);

  const load = useCallback(async () => {
    try {
      setOperators((await cp.operators()).operators);
      setPickedRoles({});
      setFailure("");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const superadmin = me.role === "superadmin";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-accent" />
            {t("cp.section.operators")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("cp.hint.operators")}</p>
        </div>
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-surface-hover"
        >
          <KeyRound className="w-4 h-4" />
          {t("cp.action.change_password")}
        </button>
        {superadmin && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:brightness-105"
          >
            <UserPlus className="w-4 h-4" />
            {t("cp.action.add_operator")}
          </button>
        )}
      </div>

      {failure && <ErrorNote>{failure}</ErrorNote>}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}

      <Card title={t("cp.section.operators")}>
        <Table
          head={[
            t("cp.field.operator"),
            t("cp.field.role"),
            t("cp.field.status"),
            t("cp.field.last_login"),
            "",
          ]}
          loading={loading}
          rows={operators.map((row) => [
            <span key="n" className="min-w-0">
              <strong className="text-foreground">{row.name}</strong>
              <span className="block text-xs text-muted font-mono">{row.email}</span>
            </span>,
            <Badge key="r" tone={row.role === "superadmin" ? "amber" : "slate"}>
              {t(`cp.role.${row.role}` as "cp.role.operator")}
            </Badge>,
            <Badge key="s" tone={row.disabled_at ? "red" : row.enrolled ? "emerald" : "amber"}>
              {row.disabled_at
                ? t("cp.state.disabled")
                : row.enrolled
                  ? t("cp.state.normal")
                  : t("cp.state.enrolment_pending")}
            </Badge>,
            formatMoment(row.last_login_at) || <span key="l" className="text-xs text-muted">{t("cp.state.never")}</span>,
            superadmin && row.id !== me.id ? (
              <span key="a" className="flex flex-wrap items-center gap-2">
                <select
                  value={pickedRoles[row.id] ?? row.role}
                  aria-label={t("cp.field.role")}
                  onChange={(event) => setPickedRoles((current) => ({ ...current, [row.id]: event.target.value }))}
                  className="rounded-lg border border-input bg-surface px-2 py-1 text-xs"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`cp.role.${role}` as "cp.role.operator")}
                    </option>
                  ))}
                </select>
                {(pickedRoles[row.id] ?? row.role) !== row.role && (
                  <button
                    type="button"
                    onClick={() => {
                      const role = pickedRoles[row.id];
                      action.run({
                        title: t("cp.action.change_role"),
                        detail: `${row.email} → ${t(`cp.role.${role}` as "cp.role.operator")}`,
                        perform: (reason) => cp.setOperatorRole(row.id, role, reason),
                        onDone: load,
                      });
                    }}
                    className="text-xs rounded-lg bg-accent text-on-accent px-2 py-1 hover:brightness-105"
                  >
                    {t("cp.action.change_role")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    action.run({
                      title: row.disabled_at ? t("cp.action.enable") : t("cp.action.disable"),
                      detail: row.email,
                      danger: !row.disabled_at,
                      perform: (reason) => cp.setOperatorEnabled(row.id, !!row.disabled_at, reason),
                      onDone: load,
                    })
                  }
                  className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover"
                >
                  {row.disabled_at ? t("cp.action.enable") : t("cp.action.disable")}
                </button>
              </span>
            ) : (
              <span key="a" className="text-xs text-muted">{row.id === me.id ? t("cp.state.you") : "—"}</span>
            ),
          ])}
          empty={t("cp.message.no_operators")}
        />
      </Card>

      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onAdded={(created) => {
            setAdding(false);
            setHandover(created);
            void load();
          }}
        />
      )}
      {handover && (
        <HandoverDialog
          created={handover}
          onClose={() => {
            setHandover(null);
            void load();
          }}
        />
      )}
      {changing && (
        <PasswordDialog
          onClose={() => setChanging(false)}
          onChanged={() => {
            setChanging(false);
            setNotice(t("cp.message.password_changed"));
          }}
        />
      )}
      {action.dialog}
    </div>
  );
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (created: CreatedOperator) => void }) {
  const { t } = useI18n();
  const [registration, setRegistration] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("operator");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  // Set once the server has refused for want of a fresh second factor: the
  // code is then required, and the next submit proves it before adding.
  const [needsCode, setNeedsCode] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  // The register spells the name; a name typed into this dialog is a name
  // somebody transliterated. The address comes with it when the register holds
  // one — an operator without an address in the register types their own.
  async function lookUp() {
    if (!registration.trim()) return;
    setLooking(true);
    setFailure("");
    try {
      const person = await cp.findPerson(registration.trim());
      setName(person.name);
      if (person.email) setEmail(person.email);
      setRegistration(person.registration_number);
      setFound(true);
    } catch (error) {
      setFound(false);
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLooking(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      // The same order as useAction: prove the second factor first, then do
      // what was asked — never as a side effect of leaving the code field.
      if (code.length === 6) {
        await cp.stepUp(code);
        setCode("");
      }
      onAdded(await cp.addOperator({ email, name, role, reason }));
    } catch (error) {
      if (error instanceof StepUpRequired) {
        setNeedsCode(true);
        return;
      }
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} label={t("cp.action.add_operator")}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("cp.action.add_operator")}</h2>
        {needsCode && <Banner tone="warning" message={t("cp.message.step_up")} />}
        {failure && <ErrorNote>{failure}</ErrorNote>}
        {/* The register first: the two fields below are filled from its
            answer, and typed over only when it is wrong or silent. */}
        <div className="flex items-end gap-2">
          <label className="block text-sm flex-1">
            <span className="text-muted">{t("cp.field.registration")}</span>
            <input
              value={registration}
              onChange={(event) => setRegistration(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void lookUp()}
            disabled={looking || !registration.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm text-foreground hover:bg-surface-hover disabled:opacity-50"
          >
            <Search className={`w-4 h-4 ${looking ? "animate-pulse" : ""}`} />
            {t("cp.action.look_up")}
          </button>
        </div>
        {found && (
          <p className="text-xs rounded-lg bg-accent-soft text-accent px-3 py-2">
            {t("cp.message.from_the_register", { name })}
          </p>
        )}

        <label className="block text-sm">
          <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
            {t("cp.field.email")}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
            {t("cp.field.name")}
          </span>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.role")}</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {t(`cp.role.${option}` as "cp.role.operator")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
            {t("cp.field.reason")}
          </span>
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>
        {/* The console asks for the second factor before it mints an account;
            the API refuses without it. Kept in the same dialog so the step-up
            does not throw away what has been typed. */}
        <label className="block text-sm">
          <span className={`text-muted${needsCode ? " after:ml-0.5 after:text-danger after:content-['*']" : ""}`}>
            {t("cp.field.code")}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required={needsCode}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono tracking-[0.4em]"
          />
          <small className="text-xs text-muted">{t("cp.hint.step_up")}</small>
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-input px-4 py-2 text-sm disabled:opacity-60"
          >
            {t("cp.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
          >
            {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
            {t("cp.action.add_operator")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The one moment these values exist.
 *
 * Nothing on the server can show the password or the secret again, so the
 * dialog says so and the enrolment is finished here, with the new operator's
 * own authenticator, before anybody walks away.
 *
 * The same contract as SecretRevealDialog — Escape and the backdrop do
 * nothing, each value has a copy button that waits for the clipboard, and
 * Close stays disabled until the operator ticks that the values are stored —
 * built on Modal directly only because this one also carries the QR code and
 * the enrolment form, which SecretRevealDialog's text-only body cannot hold.
 */
function HandoverDialog({ created, onClose }: { created: CreatedOperator; onClose: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const ackId = React.useId();

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      await cp.confirmEnrolment(created.id, code, t("cp.audit.enrolled", { email: created.email }));
      setConfirmed(true);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} dismissible={false} label={t("cp.view.handover")}>
      <div className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <KeyRound aria-hidden="true" className="w-5 h-5 text-warning" />
          {t("cp.view.handover")}
        </h2>
        <Banner tone="warning" message={t("cp.message.handover_once")} />

        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] items-start">
          <div className="rounded-xl border border-line p-3 bg-white">
            <QRCodeSVG value={created.uri} size={148} />
          </div>
          <div className="space-y-2 min-w-0">
            <Field label={t("cp.field.email")} value={created.email} />
            <Field label={t("cp.field.password")} value={created.password} secret />
            <Field label={t("cp.field.secret")} value={created.secret} secret />
          </div>
        </div>

        {confirmed ? (
          <Banner tone="success" message={t("cp.message.enrolled")} />
        ) : (
          <form onSubmit={confirm} className="space-y-3">
            <p className="text-sm text-muted">{t("cp.hint.confirm_enrolment")}</p>
            {failure && <ErrorNote>{failure}</ErrorNote>}
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                aria-label={t("cp.field.code")}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                className="w-40 rounded-lg border border-input bg-surface px-3 py-2 font-mono tracking-[0.4em]"
              />
              <button
                type="submit"
                disabled={busy}
                aria-busy={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
              >
                {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
                {t("cp.action.confirm")}
              </button>
            </div>
          </form>
        )}

        <label htmlFor={ackId} className="flex min-h-11 items-center gap-3 text-sm text-foreground">
          <input
            id={ackId}
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
            className="h-5 w-5 shrink-0"
          />
          {t("base.secret.saved_ack")}
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={!saved || busy}
            className="rounded-lg border border-input px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("base.action.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== again) {
      setFailure(t("cp.message.passwords_differ"));
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await cp.changePassword(current, next);
      onChanged();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? undefined : onClose} label={t("cp.action.change_password")}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t("cp.action.change_password")}</h2>
        {failure && <ErrorNote>{failure}</ErrorNote>}
        {[
          { label: t("cp.field.current_password"), value: current, set: setCurrent, autoComplete: "current-password" },
          { label: t("cp.field.new_password"), value: next, set: setNext, autoComplete: "new-password" },
          { label: t("cp.field.repeat_password"), value: again, set: setAgain, autoComplete: "new-password" },
        ].map((field) => (
          <label key={field.label} className="block text-sm">
            <span className="text-muted after:ml-0.5 after:text-danger after:content-['*']">
              {field.label}
            </span>
            <input
              type="password"
              required
              autoComplete={field.autoComplete}
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
            />
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-input px-4 py-2 text-sm disabled:opacity-60"
          >
            {t("cp.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:brightness-105 disabled:opacity-60"
          >
            {busy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
            {t("base.action.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const text = React.useRef<HTMLParagraphElement>(null);
  return (
    <div
      className={`min-w-0 flex items-start gap-2 rounded-lg border px-3 py-2 ${
        secret ? "bg-warning-soft border-warning-border" : "bg-surface-2 border-line"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p ref={text} className="font-mono text-sm text-foreground break-all select-all">
          {value}
        </p>
      </div>
      <CopyButton value={value} id={label} selectOnFail={text} />
    </div>
  );
}
