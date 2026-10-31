"use client";

/**
 * The SSO-client screens re-export the shared module kit, and add the one
 * piece only they need.
 *
 * Not a route: only page.tsx and route.ts are routable in the app router.
 */

import { SecretRevealDialog } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export * from "@/components/module/kit";

/**
 * SecretDialog is the only place a client secret is ever readable. The server
 * stores a digest, so closing this is the last chance to copy it — which is
 * why it is the shared SecretRevealDialog: Escape and the backdrop do nothing,
 * Done waits for "I have saved it", and the copy tick waits for the clipboard.
 */
export function SecretDialog({ clientID, secret, onClose }: {
  clientID: string; secret: string; onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <SecretRevealDialog
      title={t("sso_clients.message.secret_once_title")}
      body={t("sso_clients.message.secret_once_body")}
      items={[
        { label: "client_id", value: clientID },
        { label: "client_secret", value: secret, secret: true },
      ]}
      doneLabel={t("sso_clients.action.done")}
      onDone={onClose}
    />
  );
}
