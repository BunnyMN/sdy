"use client";

/**
 * SSO clients — OAuth2 / OIDC client management.
 *
 * The client secret is readable exactly once, in the response that mints it,
 * so the create and rotate paths both end in a modal the user has to
 * acknowledge. Every other view of a client shows no secret at all, because
 * the server has only a digest and could not show one if it wanted to.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Code2, Plus, RefreshCw, Server, Shield, Smartphone, Trash2, X,
} from "lucide-react";
import { api, type OAuth2Client, type OAuth2ClientDraft, type OAuth2Scope } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  ConfirmDialog, CopyButton, ErrorNote, Loading, Modal as Dialog, SecretRevealDialog, useCopy,
} from "@/components/ui";
import { ReadOnlyNote, useAccess } from "@/lib/permissions";
import { formatDay } from "@/lib/datetime";

const emptyDraft: OAuth2ClientDraft = {
  client_name: "",
  client_uri: "",
  client_type: "confidential",
  redirect_uris: [],
  post_logout_redirect_uris: [],
  grant_types: ["authorization_code", "refresh_token"],
  scopes: ["openid", "profile", "email"],
};

export default function SSOClientsPage() {
  const { t, locale } = useI18n();
  // Registering, editing, rotating and deleting all need developer.manage;
  // a member with only developer.read gets the list and nothing else.
  const { allowed: canManage } = useAccess("sso_clients.manage");
  const [apps, setApps] = useState<OAuth2Client[]>([]);
  const [scopes, setScopes] = useState<OAuth2Scope[]>([]);
  const [grantTypes, setGrantTypes] = useState<string[]>([]);
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ draft: OAuth2ClientDraft; clientID?: string } | null>(null);
  const [revealed, setRevealed] = useState<OAuth2Client | null>(null);
  const [confirming, setConfirming] = useState<{ app: OAuth2Client; action: "delete" | "rotate" } | null>(null);
  // The tick waits for the clipboard to say yes; one shared hook so a page of
  // cards shows one tick at a time.
  const { copied, failed, copy } = useCopy();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [list, vocabulary, urls] = await Promise.all([
        api.getSSOClients(),
        api.getSSOClientScopes(),
        api.getSSOClientEndpoints(),
      ]);
      setApps(list || []);
      setScopes(vocabulary.scopes || []);
      setGrantTypes(vocabulary.grant_types || []);
      setEndpoints(urls || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : t("base.message.error"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function save(draft: OAuth2ClientDraft, clientID?: string) {
    setError("");
    try {
      const saved = clientID
        ? await api.updateSSOClient(clientID, draft)
        : await api.createSSOClient(draft);
      setEditing(null);
      await load();
      // Only a fresh registration carries a secret worth showing.
      if (saved.client_secret) setRevealed(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("base.message.error"));
    }
  }

  async function runConfirmed() {
    if (!confirming) return;
    const { app, action } = confirming;
    setConfirming(null);
    setError("");
    try {
      if (action === "delete") {
        await api.deleteSSOClient(app.client_id);
      } else {
        setRevealed(await api.rotateSSOClientSecret(app.client_id));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("base.message.error"));
    }
  }

  const describe = (scope: OAuth2Scope) => (locale === "mn" ? scope.description_mn : scope.description);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Code2 aria-hidden="true" className="w-7 h-7 text-accent" />
            {t("sso_clients.view.title")}
          </h1>
          <p className="text-sm text-muted mt-1">{t("sso_clients.view.subtitle")}</p>
        </div>
        {canManage && <button
          onClick={() => setEditing({ draft: { ...emptyDraft } })}
          className="bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm"
        >
          <Plus aria-hidden="true" className="w-4 h-4" />
          {t("sso_clients.action.create")}
        </button>}
      </header>

      {!canManage && <ReadOnlyNote permission="sso_clients.manage" />}

      <EndpointCard endpoints={endpoints} copied={copied} failed={failed} onCopy={copy} title={t("sso_clients.view.endpoints_title")} />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading label={t("sso_clients.message.loading")} className="p-12" />
      ) : apps.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-input rounded-xl bg-surface">
          <Shield aria-hidden="true" className="w-9 h-9 text-muted mx-auto mb-3" />
          <h2 className="font-semibold text-foreground">{t("sso_clients.view.empty_title")}</h2>
          <p className="text-sm text-muted mt-1 max-w-md mx-auto">{t("sso_clients.view.empty_body")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              scopes={scopes}
              copied={copied}
              failed={failed}
              onCopy={copy}
              onEdit={() => setEditing({ clientID: app.client_id, draft: toDraft(app) })}
              onRotate={() => setConfirming({ app, action: "rotate" })}
              onDelete={() => setConfirming({ app, action: "delete" })}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {editing && (
        <AppForm
          initial={editing.draft}
          isNew={!editing.clientID}
          scopes={scopes}
          grantTypes={grantTypes}
          describe={describe}
          onCancel={() => setEditing(null)}
          onSave={(draft) => save(draft, editing.clientID)}
        />
      )}

      {revealed?.client_secret && (
        // Not dismissible by Escape or the backdrop, and Done waits for "I have
        // saved it": the server keeps only a digest, so this is the last look.
        <SecretRevealDialog
          title={t("sso_clients.message.secret_once_title")}
          body={t("sso_clients.message.secret_once_body")}
          items={[
            { label: "client_id", value: revealed.client_id },
            { label: "client_secret", value: revealed.client_secret, secret: true },
          ]}
          doneLabel={t("sso_clients.action.done")}
          onDone={() => setRevealed(null)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.app.client_name}
          body={confirming.action === "delete" ? t("sso_clients.message.delete_warning") : t("sso_clients.message.rotate_warning")}
          tone={confirming.action === "delete" ? "danger" : "default"}
          confirmLabel={confirming.action === "delete" ? t("base.action.delete") : t("sso_clients.action.rotate")}
          cancelLabel={t("base.action.cancel")}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void runConfirmed()}
        />
      )}
    </div>
  );
}

function toDraft(app: OAuth2Client): OAuth2ClientDraft {
  return {
    client_name: app.client_name,
    client_uri: app.client_uri || "",
    client_type: app.client_type,
    redirect_uris: app.redirect_uris,
    post_logout_redirect_uris: app.post_logout_redirect_uris || [],
    grant_types: app.grant_types,
    scopes: app.scopes,
    disabled: app.disabled,
  };
}

function EndpointCard({ endpoints, copied, failed, onCopy, title }: {
  endpoints: Record<string, string>; copied: string; failed: string; title: string;
  onCopy: (value: string, id: string) => unknown;
}) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    ["Discovery", endpoints.discovery],
    ["Authorization", endpoints.authorization_endpoint],
    ["Token", endpoints.token_endpoint],
    ["UserInfo", endpoints.userinfo_endpoint],
    ["JWKS", endpoints.jwks_uri],
  ].filter(([, url]) => Boolean(url)) as [string, string][];
  if (rows.length === 0) return null;

  return (
    <section className="bg-surface text-foreground rounded-xl border border-line p-5">
      <div className="flex items-center gap-3 mb-4">
        <Shield aria-hidden="true" className="w-6 h-6 text-accent" />
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
        <span className="ml-auto text-2xs bg-success-soft text-success font-mono px-3 py-1 rounded-full border border-success-border">
          {t("sso_clients.view.provider_active")}
        </span>
      </div>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map(([label, url]) => (
          <div key={label} className="flex items-center gap-2 min-w-0">
            <dt className="text-2xs uppercase tracking-wide text-muted w-24 shrink-0">{label}</dt>
            <dd className="font-mono text-xs text-muted truncate flex-1" title={url}>{url}</dd>
            <CopyButton value={url} id={label} copied={copied} failed={failed} onCopy={onCopy} />
          </div>
        ))}
      </dl>
    </section>
  );
}

function AppCard({ app, scopes, copied, failed, onCopy, onEdit, onRotate, onDelete, canManage }: {
  app: OAuth2Client; scopes: OAuth2Scope[]; copied: string; failed: string;
  onCopy: (value: string, id: string) => unknown;
  onEdit: () => void; onRotate: () => void; onDelete: () => void; canManage: boolean;
}) {
  const { t } = useI18n();
  const sensitive = useMemo(
    () => new Set(scopes.filter((s) => s.sensitive).map((s) => s.name)),
    [scopes],
  );

  return (
    <article className={`bg-surface p-5 rounded-xl border space-y-4 ${app.disabled ? "border-line opacity-70" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">{app.client_name}</h3>
          <p className="text-2xs text-muted mt-0.5">
            {app.last_used_at
              ? `${t("sso_clients.field.last_used")}: ${formatDay(app.last_used_at)}`
              : t("sso_clients.message.never_used")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {app.disabled && (
            <span className="text-2xs bg-surface-2 text-muted px-2 py-0.5 rounded-full">
              {t("sso_clients.message.disabled")}
            </span>
          )}
          <span className="text-2xs bg-accent-soft text-accent font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
            {app.client_type === "public" ? <Smartphone className="w-3 h-3" /> : <Server className="w-3 h-3" />}
            {app.client_type}
          </span>
        </div>
      </div>

      <div className="text-xs font-mono bg-surface-2 p-3 rounded-lg border border-line space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted shrink-0">client_id</span>
          <span className="text-foreground font-semibold truncate" title={app.client_id}>{app.client_id}</span>
          <CopyButton value={app.client_id} id={app.client_id} copied={copied} failed={failed} onCopy={onCopy} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted shrink-0">client_secret</span>
          <span className="text-muted italic font-sans text-2xs">
            {app.client_type === "public" ? "—" : t("sso_clients.message.secret_hidden")}
          </span>
        </div>
      </div>

      <Field label={t("sso_clients.field.redirect_uris")}>
        {app.redirect_uris.map((uri) => (
          <Chip key={uri} mono>{uri}</Chip>
        ))}
      </Field>

      {/* Only shown once there is one: an application that never ends a session
          here has no reason to carry an empty row about it. */}
      {(app.post_logout_redirect_uris || []).length > 0 && (
        <Field label={t("sso_clients.field.post_logout_redirect_uris")}>
          {app.post_logout_redirect_uris.map((uri) => (
            <Chip key={uri} mono>{uri}</Chip>
          ))}
        </Field>
      )}

      <Field label={t("sso_clients.field.scopes")}>
        {app.scopes.map((scope) => (
          <Chip key={scope} mono tone={sensitive.has(scope) ? "amber" : "blue"}>{scope}</Chip>
        ))}
      </Field>

      <Field label={t("sso_clients.field.grant_types")}>
        {app.grant_types.map((grant) => <Chip key={grant} mono tone="slate">{grant}</Chip>)}
      </Field>

      <div className={`flex gap-2 pt-1 border-t border-line ${canManage ? "" : "hidden"}`}>
        <button onClick={onEdit} className="text-xs font-semibold text-muted hover:bg-surface-hover px-3 py-1.5 rounded-lg mt-2">
          {t("sso_clients.view.edit_title")}
        </button>
        {app.client_type !== "public" && (
          <button onClick={onRotate} className="text-xs font-semibold text-warning hover:bg-warning-soft px-3 py-1.5 rounded-lg mt-2 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> {t("sso_clients.action.rotate")}
          </button>
        )}
        <button onClick={onDelete} className="text-xs font-semibold text-danger hover:bg-danger-soft px-3 py-1.5 rounded-lg mt-2 ml-auto flex items-center gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> {t("base.action.delete")}
        </button>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-2xs font-semibold text-foreground block mb-1">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ children, mono, tone = "slate" }: {
  children: React.ReactNode; mono?: boolean; tone?: "slate" | "blue" | "amber";
}) {
  const tones = {
    slate: "bg-surface-2 text-muted",
    blue: "bg-info-soft text-info",
    amber: "bg-warning-soft text-warning border border-warning-border",
  };
  return (
    <span className={`text-2xs px-2 py-0.5 rounded ${tones[tone]} ${mono ? "font-mono" : ""} break-all`}>
      {children}
    </span>
  );
}

function AppForm({ initial, isNew, scopes, grantTypes, describe, onCancel, onSave }: {
  initial: OAuth2ClientDraft; isNew: boolean; scopes: OAuth2Scope[]; grantTypes: string[];
  describe: (scope: OAuth2Scope) => string;
  onCancel: () => void; onSave: (draft: OAuth2ClientDraft) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);
  const [uris, setUris] = useState(initial.redirect_uris.join("\n"));
  const [logoutUris, setLogoutUris] = useState((initial.post_logout_redirect_uris || []).join("\n"));

  function toggle(field: "scopes" | "grant_types", value: string) {
    setDraft((d) => {
      const current = d[field] || [];
      return { ...d, [field]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });
  }

  // Compared as data rather than by the Modal's field scan: the scope and
  // grant checkboxes are controlled, so their defaultChecked says nothing.
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    uris !== initial.redirect_uris.join("\n") ||
    logoutUris !== (initial.post_logout_redirect_uris || []).join("\n");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...draft,
      redirect_uris: uris.split("\n").map((s) => s.trim()).filter(Boolean),
      post_logout_redirect_uris: logoutUris.split("\n").map((s) => s.trim()).filter(Boolean),
    });
  }

  return (
    <Modal onClose={onCancel} wide dirty={dirty} label={isNew ? t("sso_clients.view.create_title") : t("sso_clients.view.edit_title")}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {isNew ? t("sso_clients.view.create_title") : t("sso_clients.view.edit_title")}
        </h2>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">{t("sso_clients.field.name")} *</span>
          <input
            value={draft.client_name}
            onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
            required
            className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">{t("sso_clients.field.homepage")}</span>
          <input
            value={draft.client_uri || ""}
            onChange={(e) => setDraft({ ...draft, client_uri: e.target.value })}
            placeholder="https://example.mn"
            className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg font-mono"
          />
        </label>

        {isNew && (
          <fieldset>
            <legend className="text-xs font-semibold text-foreground mb-1">{t("sso_clients.field.client_type")}</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {(["confidential", "public"] as const).map((type) => (
                <label
                  key={type}
                  className={`border rounded-lg p-3 cursor-pointer text-xs ${draft.client_type === type ? "border-accent bg-accent-soft" : "border-line"}`}
                >
                  <input
                    type="radio"
                    name="client_type"
                    className="sr-only"
                    checked={draft.client_type === type}
                    onChange={() => setDraft({ ...draft, client_type: type })}
                  />
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {type === "public" ? <Smartphone className="w-3.5 h-3.5" /> : <Server className="w-3.5 h-3.5" />}
                    {type === "public" ? t("sso_clients.type.public") : t("sso_clients.type.confidential")}
                  </span>
                  <span className="text-muted block mt-1">
                    {type === "public" ? t("sso_clients.type.public_hint") : t("sso_clients.type.confidential_hint")}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="text-xs font-semibold text-foreground">{t("sso_clients.field.redirect_uris")} *</span>
          <textarea
            value={uris}
            onChange={(e) => setUris(e.target.value)}
            rows={3}
            placeholder={"https://app.example.mn/callback\nhttp://localhost:3000/callback"}
            className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg font-mono"
          />
          <span className="text-2xs text-muted">
            {/* Exact matching is what stops a code being delivered somewhere else. */}
            {t("sso_clients.hint.redirect_uris")}
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-foreground">{t("sso_clients.field.post_logout_redirect_uris")}</span>
          <textarea
            value={logoutUris}
            onChange={(e) => setLogoutUris(e.target.value)}
            rows={2}
            placeholder={"https://app.example.mn/"}
            className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-lg font-mono"
          />
          <span className="text-2xs text-muted">
            {/* Matched exactly too: an unchecked return address would make the
                logout endpoint an open redirector. */}
            {t("sso_clients.hint.post_logout_redirect_uris")}
          </span>
        </label>

        <fieldset>
          <legend className="text-xs font-semibold text-foreground mb-1">{t("sso_clients.field.grant_types")}</legend>
          <div className="flex flex-wrap gap-2">
            {grantTypes.map((grant) => (
              <label
                key={grant}
                className={`text-2xs font-mono px-2.5 py-1 rounded-lg border cursor-pointer ${draft.grant_types?.includes(grant) ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
              >
                <input type="checkbox" className="sr-only" checked={draft.grant_types?.includes(grant)} onChange={() => toggle("grant_types", grant)} />
                {grant}
              </label>
            ))}
          </div>
          <p className="text-2xs text-muted mt-1">{t("sso_clients.message.pkce_note")}</p>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold text-foreground mb-1">{t("sso_clients.field.scopes")}</legend>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {scopes.map((scope) => (
              <label key={scope.name} className="flex items-start gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.scopes?.includes(scope.name)}
                  onChange={() => toggle("scopes", scope.name)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-mono text-foreground">{scope.name}</span>
                  {scope.sensitive && (
                    <span className="ml-1.5 text-2xs bg-warning-soft text-warning border border-warning-border px-1 rounded">
                      {t("oauth.consent.sensitive")}
                    </span>
                  )}
                  <span className="block text-muted">{describe(scope)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {!isNew && (
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={Boolean(draft.disabled)} onChange={(e) => setDraft({ ...draft, disabled: e.target.checked })} />
            {t("sso_clients.action.disable")}
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted hover:bg-surface-hover rounded-lg">
            {t("base.action.cancel")}
          </button>
          <button type="submit" className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-on-accent rounded-lg font-semibold">
            {t("base.action.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// The platform's dialog, with an X in the corner. The one-time secret and the
// confirmation are the shared SecretRevealDialog and ConfirmDialog now; this is
// the registration form. Escape and the backdrop close it too, asking first
// when the form has been edited (`dirty`).
function Modal({ children, onClose, wide, label, dirty }: {
  children: React.ReactNode; onClose: () => void; wide?: boolean; label?: string; dirty?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog size={wide ? "lg" : "md"} scrollable label={label} onClose={onClose} dirty={dirty} className="my-8 relative">
      {/* Always named "Close": the dialog's label is the dialog's name, not
          the button's, and an icon-only button needs one of its own. */}
      <button type="button" onClick={onClose} className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-md text-muted hover:text-foreground hover:bg-surface-hover" aria-label={t("base.action.close")}>
        <X aria-hidden="true" className="w-4 h-4" />
      </button>
      {children}
    </Dialog>
  );
}
