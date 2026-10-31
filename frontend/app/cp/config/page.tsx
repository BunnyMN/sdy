"use client";

/**
 * How the platform behaves, and what is switched on.
 *
 * Two lists on one screen because they are the same question asked twice —
 * "what is this deployment doing right now" — and an operator during an
 * incident should not have to remember which of two pages holds the answer.
 *
 * Every field says where its value came from. A setting reading "environment"
 * is one somebody set in a file and forgot; one reading "database" was chosen
 * here, and the history says by whom and why.
 */

import React, { useCallback, useEffect, useState } from "react";
import { History, KeyRound, Loader2, Pencil, RotateCcw, ToggleLeft, ToggleRight } from "lucide-react";

import { useAction } from "@/components/cp/Action";
import { Badge, Card, formatMoment, Table } from "@/components/cp/ui";
import { cp, StepUpRequired, type Credential, type Flag, type Setting, type SettingChange } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";
import { ubDateToISO, isoToUbDate } from "@/lib/ubTime";
import { Banner, ErrorNote, Modal } from "@/components/ui";

export default function Configuration() {
  const { t } = useI18n();
  const action = useAction();

  const [settings, setSettings] = useState<Setting[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Setting | null>(null);
  const [history, setHistory] = useState<{
    key: string;
    changes: SettingChange[];
    loading: boolean;
    failure: string;
  } | null>(null);
  // null: closed; "new": creating; a flag: editing that one.
  const [flagDialog, setFlagDialog] = useState<Flag | "new" | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [sealing, setSealing] = useState(true);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

  const load = useCallback(async () => {
    try {
      const [config, flagList, keys] = await Promise.all([cp.settings(), cp.flags(), cp.credentials()]);
      setSettings(config.settings);
      setWarnings(config.warnings ?? []);
      setFlags(flagList.flags);
      setCredentials(keys.credentials);
      setSealing(keys.sealing_configured);
      setFailure("");
      setLoaded(true);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The dialog opens at once and fills when the answer arrives; a refusal is
  // said inside it rather than leaving the button looking dead.
  async function openHistory(key: string) {
    setHistory({ key, changes: [], loading: true, failure: "" });
    try {
      const result = await cp.settingHistory(key);
      setHistory((current) => (current?.key === key ? { key, changes: result.changes, loading: false, failure: "" } : current));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHistory((current) => (current?.key === key ? { ...current, loading: false, failure: message } : current));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t("cp.section.config")}</h1>
        <p className="mt-1 text-sm text-muted">{t("cp.hint.config")}</p>
      </div>

      {warnings.map((warning) => (
        <Banner key={warning} tone="warning" message={warning} />
      ))}
      {failure && <ErrorNote>{failure}</ErrorNote>}

      {/* Nothing is drawn until all three lists have been read: a screen that
          renders the half it got says the other half is empty, not unread. */}
      {(loaded || !failure) && (
      <>
      <Card title={t("cp.section.settings")}>
        <Table
          head={[t("cp.field.setting"), t("cp.field.value"), t("cp.field.source"), ""]}
          rows={settings.map((setting) => [
            <span key="k">
              <span className="font-mono text-xs text-foreground">{setting.key}</span>
              <span className="block text-xs text-muted">{setting.description}</span>
            </span>,
            <span key="v" className="font-mono text-xs">
              {setting.current === "" ? "—" : setting.current}
            </span>,
            <Badge key="s" tone={setting.source === "database" ? "emerald" : "slate"}>
              {t(`cp.source.${setting.source}`)}
            </Badge>,
            <span key="a" className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(setting)}
                aria-label={`${t("cp.action.change")}: ${setting.key}`}
                title={t("cp.action.change")}
                className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover"
              >
                {t("cp.action.change")}
              </button>
              <button
                type="button"
                onClick={() => void openHistory(setting.key)}
                aria-label={`${t("cp.section.history")}: ${setting.key}`}
                title={t("cp.section.history")}
                className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover inline-flex items-center gap-1"
              >
                <History className="w-3 h-3" />
              </button>
            </span>,
          ])}
          loading={loading}
          empty={t("cp.message.no_settings")}
        />
      </Card>

      <Card title={t("cp.section.credentials")}>
        <p className="px-4 pt-4 text-sm text-muted">{t("cp.hint.credentials")}</p>
        {!sealing && (
          <div className="mx-4 mt-3">
            <Banner tone="warning" message={t("cp.message.sealing_off")} />
          </div>
        )}
        <Table
          head={[t("cp.field.credential"), t("cp.field.source"), t("cp.field.updated"), ""]}
          rows={credentials.map((credential) => [
            <span key="k">
              <span className="font-mono text-xs text-foreground">{credential.name}</span>
              <span className="block text-xs text-muted">{credential.description}</span>
              <span className="block text-xs text-muted font-mono">{credential.env}</span>
            </span>,
            <span key="s" className="inline-flex items-center gap-2">
              <Badge tone={credential.source === "database" ? "emerald" : credential.source === "environment" ? "slate" : "red"}>
                {t(`cp.source.${credential.source}`)}
              </Badge>
              {/* The last four characters, and only of a value long enough that
                  four does not give it away. It is how an operator tells two
                  keys apart and sees that a rotation landed. */}
              {credential.hint && <span className="font-mono text-xs text-muted">…{credential.hint}</span>}
            </span>,
            <span key="u" className="text-xs text-muted">
              {credential.updated_at ? formatMoment(credential.updated_at) : "—"}
            </span>,
            <span key="a" className="flex gap-2">
              <button
                type="button"
                disabled={!sealing}
                onClick={() => setEditingCredential(credential)}
                className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover disabled:opacity-50 inline-flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3" />
                {t("cp.action.set_credential")}
              </button>
              {credential.source === "database" && (
                <button
                  type="button"
                  onClick={() =>
                    action.run({
                      title: t("cp.action.clear_credential"),
                      detail: credential.name,
                      danger: true,
                      perform: (reason) => cp.clearCredential(credential.name, reason),
                      onDone: load,
                    })
                  }
                  aria-label={`${t("cp.action.clear_credential")}: ${credential.name}`}
                  title={t("cp.action.clear_credential")}
                  className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover"
                >
                  ✕
                </button>
              )}
            </span>,
          ])}
          loading={loading}
          empty={t("cp.message.no_credentials")}
        />
      </Card>

      <Card title={t("cp.section.flags")}>
        <div className="p-4 pb-0">
          <button
            type="button"
            onClick={() => setFlagDialog("new")}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:brightness-105"
          >
            {t("cp.action.new_flag")}
          </button>
        </div>
        <Table
          head={[t("cp.field.flag"), t("cp.field.kind"), t("cp.field.rollout"), t("cp.field.expires"), ""]}
          rows={flags.map((flag) => [
            <span key="k">
              <span className="font-mono text-xs text-foreground">{flag.key}</span>
              <span className="block text-xs text-muted">
                {flag.description}
                {flag.owner ? ` · ${flag.owner}` : ""}
              </span>
            </span>,
            <Badge key="t" tone={flag.kind === "kill_switch" ? "red" : "slate"}>
              {t(`cp.kind.${flag.kind}`)}
            </Badge>,
            <span key="r" className="tabular-nums text-xs">
              {flag.enabled ? `${flag.rollout}%` : t("cp.state.off")}
            </span>,
            <span key="e" className={flag.expires_at && new Date(flag.expires_at) < new Date() ? "text-warning font-medium" : ""}>
              {formatMoment(flag.expires_at) || "—"}
            </span>,
            <span key="a" className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  action.run({
                    title: flag.enabled ? t("cp.action.turn_off") : t("cp.action.turn_on"),
                    detail: flag.key,
                    danger: flag.kind === "kill_switch" && !flag.enabled,
                    perform: (reason) =>
                      cp.saveFlag({ ...flag, enabled: !flag.enabled, reason }),
                    onDone: load,
                  })
                }
                aria-label={`${flag.enabled ? t("cp.action.turn_off") : t("cp.action.turn_on")}: ${flag.key}`}
                title={flag.enabled ? t("cp.action.turn_off") : t("cp.action.turn_on")}
                className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover inline-flex items-center gap-1"
              >
                {flag.enabled ? (
                  <ToggleRight aria-hidden="true" className="w-4 h-4 text-success" />
                ) : (
                  <ToggleLeft aria-hidden="true" className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setFlagDialog(flag)}
                aria-label={`${t("cp.action.edit_flag")}: ${flag.key}`}
                title={t("cp.action.edit_flag")}
                className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover inline-flex items-center gap-1"
              >
                <Pencil aria-hidden="true" className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  action.run({
                    title: t("cp.action.delete_flag"),
                    detail: flag.key,
                    danger: true,
                    perform: (reason) => cp.deleteFlag(flag.key, reason),
                    onDone: load,
                  })
                }
                aria-label={`${t("cp.action.delete_flag")}: ${flag.key}`}
                title={t("cp.action.delete_flag")}
                className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover"
              >
                ✕
              </button>
            </span>,
          ])}
          loading={loading}
          empty={t("cp.message.no_flags")}
        />
      </Card>
      </>
      )}

      {editing && (
        <SettingDialog
          setting={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {editingCredential && (
        <CredentialDialog
          credential={editingCredential}
          onClose={() => setEditingCredential(null)}
          onSaved={() => {
            setEditingCredential(null);
            void load();
          }}
        />
      )}

      {history && (
        <Modal size="lg" onClose={() => setHistory(null)} label={`${t("cp.section.history")}: ${history.key}`}>
          <div className="p-5 space-y-4">
            <h2 className="font-semibold text-foreground">
              {t("cp.section.history")}: <span className="font-mono text-sm">{history.key}</span>
            </h2>
            {history.failure && <ErrorNote>{history.failure}</ErrorNote>}
            <Table
              loading={history.loading}
              head={[t("cp.field.when"), t("cp.field.value"), t("cp.field.operator"), t("cp.field.reason"), ""]}
              rows={history.changes.map((change) => [
                formatMoment(change.changed_at),
                <span key="v" className="font-mono text-xs">
                  {change.previous_value ?? "—"} → {change.new_value}
                </span>,
                change.changed_by,
                change.reason,
                <button
                  key="r"
                  type="button"
                  onClick={() => {
                    // The history stays open underneath: a cancelled rollback
                    // returns to the list it was chosen from, and a finished
                    // one shows the new row at the top of it.
                    action.run({
                      title: t("cp.action.rollback"),
                      detail: `${change.key}: ${change.previous_value ?? "—"}`,
                      perform: (reason) => cp.rollbackSetting(change.id, reason),
                      onDone: () => {
                        void load();
                        void openHistory(change.key);
                      },
                    });
                  }}
                  className="text-xs rounded-lg border border-input px-2 py-1 hover:bg-surface-hover inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t("cp.action.rollback")}
                </button>,
              ])}
              empty={t("cp.message.no_history")}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setHistory(null)}
                className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-hover"
              >
                {t("base.action.close")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {flagDialog && (
        <FlagDialog
          flag={flagDialog === "new" ? null : flagDialog}
          onClose={() => setFlagDialog(null)}
          onSaved={() => {
            setFlagDialog(null);
            void load();
          }}
        />
      )}

      {action.dialog}
    </div>
  );
}

/**
 * Setting a credential.
 *
 * The field starts empty and there is nothing to prefill it with: no route
 * returns a stored value, so what is on screen is what is being typed now. A
 * dialog that showed the current key would be the one place in this console
 * where a stolen session is worth more than the actions it can take.
 */
function CredentialDialog({
  credential,
  onClose,
  onSaved,
}: {
  credential: Credential;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      if (needsCode) await cp.stepUp(code);
      await cp.setCredential(credential.name, value, reason);
      onSaved();
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
    <Modal onClose={busy ? undefined : onClose} label={credential.name}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <h2 className="font-mono text-sm font-semibold text-foreground">{credential.name}</h2>
          <p className="mt-1 text-sm text-muted">{credential.description}</p>
          {credential.docs && (
            <a
              href={credential.docs}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-accent hover:underline"
            >
              {credential.docs}
            </a>
          )}
        </div>

        <p className="text-xs text-muted">{t("cp.message.credential_write_only")}</p>

        {needsCode && <Banner tone="warning" message={t("cp.message.step_up")} />}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        <label className="block text-sm">
          <span className={`text-muted ${REQUIRED}`}>{t("cp.field.value")}</span>
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono"
          />
        </label>

        <label className="block text-sm">
          <span className={`text-muted ${REQUIRED}`}>{t("cp.field.reason")}</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        {needsCode && <CodeField code={code} onChange={setCode} />}

        <DialogButtons busy={busy} onClose={onClose} label={t("cp.action.set_credential")} />
      </form>
    </Modal>
  );
}

function SettingDialog({
  setting,
  onClose,
  onSaved,
}: {
  setting: Setting;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(setting.current);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      if (needsCode) await cp.stepUp(code);
      await cp.setSetting(setting.key, value, reason);
      onSaved();
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
    <Modal onClose={busy ? undefined : onClose} label={setting.key}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <h2 className="font-mono text-sm font-semibold text-foreground">{setting.key}</h2>
          <p className="mt-1 text-sm text-muted">{setting.description}</p>
        </div>

        {needsCode && <Banner tone="warning" message={t("cp.message.step_up")} />}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.value")}</span>
          {setting.kind === "enum" ? (
            <select
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
            >
              {(setting.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : setting.kind === "bool" ? (
            <select
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
            >
              <option value="false">{t("cp.value.false")}</option>
              <option value="true">{t("cp.value.true")}</option>
            </select>
          ) : (
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono text-sm"
            />
          )}
          <span className="mt-1 block text-xs text-muted">
            {t("cp.field.default")}: <span className="font-mono">{setting.default || "—"}</span>
            {setting.env ? ` · ${setting.env}` : ""}
          </span>
        </label>

        <label className="block text-sm">
          <span className={`text-muted ${REQUIRED}`}>{t("cp.field.reason")}</span>
          <input
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
        </label>

        {needsCode && <CodeField code={code} onChange={setCode} />}

        <DialogButtons busy={busy} onClose={onClose} label={t("cp.action.confirm")} />
      </form>
    </Modal>
  );
}

/**
 * Creating a flag, or changing one that exists.
 *
 * Editing used to mean deleting the flag and creating it again — which loses
 * its overrides and, for the moment in between, its kill switch — so the
 * rollout, expiry, owner and description of a live flag could only be changed
 * by somebody willing to do that. The key is the flag's identity and is fixed
 * once it exists; the on/off state keeps its own button in the row.
 */
function FlagDialog({
  flag,
  onClose,
  onSaved,
}: {
  flag: Flag | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState(flag?.key ?? "");
  const [description, setDescription] = useState(flag?.description ?? "");
  const [owner, setOwner] = useState(flag?.owner ?? "");
  const [kind, setKind] = useState<Flag["kind"]>(flag?.kind ?? "release");
  const [rollout, setRollout] = useState(String(flag?.rollout ?? 100));
  const [expires, setExpires] = useState(isoToUbDate(flag?.expires_at));
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);

  const rolloutNumber = Number(rollout);
  const rolloutValid = rollout.trim() !== "" && Number.isInteger(rolloutNumber) && rolloutNumber >= 0 && rolloutNumber <= 100;
  const title = flag ? t("cp.action.edit_flag") : t("cp.action.new_flag");
  const dirty =
    key !== (flag?.key ?? "") ||
    description !== (flag?.description ?? "") ||
    owner !== (flag?.owner ?? "") ||
    kind !== (flag?.kind ?? "release") ||
    rollout !== String(flag?.rollout ?? 100) ||
    expires !== isoToUbDate(flag?.expires_at) ||
    reason !== "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!rolloutValid) {
      setFailure(t("cp.message.rollout_range"));
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      if (needsCode) await cp.stepUp(code);
      await cp.saveFlag({
        key,
        description,
        owner,
        kind,
        // Editing keeps the flag on or off as it was; that is the row's
        // toggle, with its own reason, not a side effect of fixing a typo.
        enabled: flag?.enabled ?? false,
        rollout: rolloutNumber,
        // A flag with no date is a flag nobody will remember to remove, so the
        // field is offered every time one is created — the console warns about
        // the ones that lapse, and it can only warn about the ones that have a
        // date to lapse. The date is a day in Ulaanbaatar: the flag lapses
        // when that day ends there, wherever the operator's laptop thinks it is.
        expires_at: expires ? ubDateToISO(expires) : null,
        reason,
      });
      onSaved();
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
    <Modal onClose={busy ? undefined : onClose} label={title} dirty={dirty}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>

        {needsCode && <Banner tone="warning" message={t("cp.message.step_up")} />}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        {flag ? (
          <div className="text-sm">
            <span className="text-muted">{t("cp.field.flag")}</span>
            <p className="mt-1 font-mono text-sm text-foreground">{flag.key}</p>
          </div>
        ) : (
          <Line label={t("cp.field.flag")} value={key} onChange={setKey} required mono />
        )}
        <Line label={t("cp.field.description")} value={description} onChange={setDescription} />
        <Line label={t("cp.field.owner")} value={owner} onChange={setOwner} />

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.kind")}</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          >
            <option value="release">{t("cp.kind.release")}</option>
            <option value="kill_switch">{t("cp.kind.kill_switch")}</option>
            <option value="experiment">{t("cp.kind.experiment")}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className={`text-muted ${REQUIRED}`}>{t("cp.field.rollout")} (%)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            required
            value={rollout}
            onChange={(event) => setRollout(event.target.value)}
            aria-invalid={!rolloutValid}
            aria-describedby="flag-rollout-hint"
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 tabular-nums"
          />
          <span id="flag-rollout-hint" className={`mt-1 block text-xs ${rolloutValid ? "text-muted" : "text-danger"}`}>
            {t("cp.message.rollout_range")}
          </span>
        </label>

        <label className="block text-sm">
          <span className="text-muted">{t("cp.field.expires")}</span>
          <input
            type="date"
            value={expires}
            onChange={(event) => setExpires(event.target.value)}
            aria-describedby="flag-expires-hint"
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2"
          />
          <span id="flag-expires-hint" className="mt-1 block text-xs text-muted">
            {t("cp.hint.ub_date")}
          </span>
        </label>

        <Line label={t("cp.field.reason")} value={reason} onChange={setReason} required />

        {needsCode && <CodeField code={code} onChange={setCode} />}

        <DialogButtons
          busy={busy}
          onClose={onClose}
          label={flag ? t("base.action.save") : t("cp.action.create")}
        />
      </form>
    </Modal>
  );
}

/** The marker on a required field's label — a pseudo-element, so it is not part of the label's text. */
const REQUIRED = "after:ml-0.5 after:text-danger after:content-['*']";

function CodeField({ code, onChange }: { code: string; onChange: (code: string) => void }) {
  const { t } = useI18n();
  return (
    <label className="block text-sm">
      <span className={`text-muted ${REQUIRED}`}>{t("cp.field.code")}</span>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        value={code}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono tracking-[0.4em]"
      />
    </label>
  );
}

function DialogButtons({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-hover disabled:opacity-60"
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
        {label}
      </button>
    </div>
  );
}

function Line({
  label,
  value,
  onChange,
  required,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className={`text-muted${required ? ` ${REQUIRED}` : ""}`}>{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 ${mono ? "font-mono text-sm" : ""}`}
      />
    </label>
  );
}
