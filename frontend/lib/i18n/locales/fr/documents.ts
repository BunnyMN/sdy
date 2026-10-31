/**
 * fr overlay for the documents app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale fr` to draft the remainder.
 */
export const fr: Record<string, string> = {
  "contracts.action.stop_waiting": "Arrêter d’attendre",
  "contracts.body.tokens_summary": "Champs de substitution",
  "contracts.confirm.remove_party_body": "« {name} » sera retirée du contrat, avec ses signataires.",
  "contracts.confirm.remove_party_title": "Retirer cette partie ?",
  "contracts.confirm.withdraw_body": "Les copies déjà envoyées ne pourront plus être signées. Le motif est affiché à toutes les parties.",
  "contracts.confirm.withdraw_title": "Retirer le contrat ?",
  "contracts.issue.already_issued": "Déjà émis",
  "contracts.issue.create_n": "Créer {count} contrats",
  "contracts.issue.csv_row": "Ligne",
  "contracts.issue.preview_counts": "{total} lignes · {ok} utilisables · {bad} ignorées",
  "contracts.issue.preview_hint": "Le fichier est d’abord lu et affiché — aucun contrat n’est créé avant que vous cliquiez sur Créer.",
  "contracts.issue.preview_title": "« {file} » — aperçu",
  "contracts.issue.row_ok": "Prêt",
  "contracts.issue.skipped_csv": "Télécharger le CSV",
  "contracts.issue.skipped_title": "Lignes ignorées ({count})",
  "contracts.msg.ceremony_code": "Code de vérification {code}. Vérifiez-le sur votre téléphone et signez avec le PIN2.",
  "contracts.msg.ceremony_expired": "La demande a expiré. Veuillez recommencer.",
  "contracts.msg.ceremony_failed": "La signature n’a pas abouti.",
  "contracts.msg.ceremony_starting": "Envoi de la demande au téléphone…",
  "contracts.msg.facts_saved": "Les détails du contrat ont été enregistrés.",
  "contracts.msg.unsaved": "Modifications non enregistrées",
  "contracts.msg.uploading": "Envoi du fichier…",
  "contracts.send.skipped_title": "{count} parties n’ont pas été atteintes",
  "contracts.step.done": "terminé",
  "contracts.step.facts": "Détails",
  "contracts.step.file": "Fichier et texte",
  "contracts.step.issue": "Émission",
  "contracts.step.label": "Étapes du contrat",
  "contracts.step.parties": "Parties",
  "contracts.step.progress": "{done} étapes sur {total} prêtes",
  "contracts.step.send": "Envoi",
  "documents.confirm.remove_step_body": "L’étape {n}, « {name} », sera supprimée. Rien n’est enregistré avant que vous cliquiez sur Enregistrer.",
  "documents.confirm.remove_step_title": "Supprimer cette étape ?",
};
