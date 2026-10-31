/**
 * fr overlay for the esign app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale fr` to draft the remainder.
 */
export const fr: Record<string, string> = {
  "esign.action.cancel_batch": "Annuler le lot",
  "esign.action.keep_batch": "Conserver",
  "esign.action.preview_document": "Voir le document",
  "esign.action.undo": "Annuler",
  "esign.confirm.cancel_batch_body": "Les documents non signés du lot « {name} » seront ignorés. Ceux déjà signés le restent. Action irréversible.",
  "esign.confirm.cancel_batch_title": "Annuler ce lot ?",
  "esign.eid.confirm_note": "Dès que vous cliquez sur Commencer, le document est envoyé à eID Mongolia et une demande de confirmation arrive sur votre téléphone.",
  "esign.eid.confirm_title": "Vérifiez avant l’envoi",
  "esign.eid.expires_in": "Expire dans {time}",
  "esign.eid.expires_in_minutes": "Environ {minutes} minutes restantes",
  "esign.eid.expiring": "Expiration…",
  "esign.eid.open_preview": "Ouvrir dans un nouvel onglet",
  "esign.eid.pick_other": "Choisir un autre fichier",
  "esign.eid.preview_unavailable": "Ce navigateur ne peut pas afficher le PDF ici.",
  "esign.eid.size": "Taille",
  "esign.eid.start": "Commencer la signature",
  "esign.eid.step_check": "Vérifier",
  "esign.eid.step_compare_code": "Vérifiez que le code de l’application correspond exactement à celui affiché ici.",
  "esign.eid.step_done": "terminé",
  "esign.eid.step_download": "Télécharger",
  "esign.eid.step_open_app": "Ouvrez l’application eID Mongolia sur votre téléphone.",
  "esign.eid.step_phone": "Confirmer sur le téléphone",
  "esign.eid.step_pick": "Choisir",
  "esign.eid.steps_label": "Étapes de signature",
  "esign.field.placement_box": "zone de signature",
  "esign.message.item_failed": "Ce document n’a pas pu être signé.",
  "esign.message.placement_box_label": "Zone de signature : X {x}, Y {y}, largeur {width}, hauteur {height} pt",
  "esign.message.placement_drag_hint": "Faites glisser la zone pour la déplacer, son coin pour la redimensionner. Les flèches la déplacent de 1 pt (Maj : 10) ; Alt+flèches redimensionnent.",
  "esign.message.probe_failed": "Le HSM est injoignable.",
  "esign.message.probe_ok": "La connexion au HSM fonctionne.",
  "esign.signature.draw_hint": "Dessinez votre signature dans le cadre blanc avec la souris, le doigt ou un stylet. Un appui laisse un point ; Annuler efface le dernier trait.",
  "esign.signature.mode": "Mode de signature",
  "esign.signature.mode_draw": "Dessiner",
  "esign.signature.mode_type": "Saisir votre nom",
  "esign.signature.type_hint": "Si vous ne pouvez pas dessiner, saisissez votre nom : il est mis en forme manuscrite comme signature.",
  "esign.signature.typed_label": "Nom complet",
};
