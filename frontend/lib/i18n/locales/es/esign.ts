/**
 * es overlay for the esign app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale es` to draft the remainder.
 */
export const es: Record<string, string> = {
  "esign.action.cancel_batch": "Cancelar el lote",
  "esign.action.keep_batch": "Mantener",
  "esign.action.preview_document": "Ver el documento",
  "esign.action.undo": "Deshacer",
  "esign.confirm.cancel_batch_body": "Se omitirán los documentos sin firmar de «{name}». Los firmados siguen firmados. No se puede deshacer.",
  "esign.confirm.cancel_batch_title": "¿Cancelar este lote?",
  "esign.eid.confirm_note": "Al pulsar Empezar, el documento se envía a eID Mongolia y llega una solicitud de confirmación a su teléfono.",
  "esign.eid.confirm_title": "Compruebe antes de enviar",
  "esign.eid.expires_in": "Caduca en {time}",
  "esign.eid.expires_in_minutes": "Quedan unos {minutes} minutos",
  "esign.eid.expiring": "Caducando…",
  "esign.eid.open_preview": "Abrir en una pestaña nueva",
  "esign.eid.pick_other": "Elegir otro archivo",
  "esign.eid.preview_unavailable": "Este navegador no puede mostrar el PDF aquí.",
  "esign.eid.size": "Tamaño",
  "esign.eid.start": "Empezar a firmar",
  "esign.eid.step_check": "Comprobar",
  "esign.eid.step_compare_code": "Compruebe que el código de la aplicación coincide exactamente con el que se muestra aquí.",
  "esign.eid.step_done": "hecho",
  "esign.eid.step_download": "Descargar",
  "esign.eid.step_open_app": "Abra la aplicación eID Mongolia en su teléfono.",
  "esign.eid.step_phone": "Confirmar en el teléfono",
  "esign.eid.step_pick": "Elegir",
  "esign.eid.steps_label": "Pasos de la firma",
  "esign.field.placement_box": "recuadro de firma",
  "esign.message.item_failed": "No se pudo firmar este documento.",
  "esign.message.placement_box_label": "Recuadro de firma: X {x}, Y {y}, ancho {width}, alto {height} pt",
  "esign.message.placement_drag_hint": "Arrastre el recuadro para moverlo y su esquina para cambiar el tamaño. Las flechas lo mueven 1 pt (Mayús: 10); Alt+flechas cambian el tamaño.",
  "esign.message.probe_failed": "No se pudo contactar con el HSM.",
  "esign.message.probe_ok": "La conexión con el HSM funciona.",
  "esign.signature.draw_hint": "Dibuje su firma en el recuadro blanco con el ratón, el dedo o un lápiz. Un toque deja un punto; Deshacer borra el último trazo.",
  "esign.signature.mode": "Cómo firmar",
  "esign.signature.mode_draw": "Dibujar",
  "esign.signature.mode_type": "Escribir su nombre",
  "esign.signature.type_hint": "Si no puede dibujar, escriba su nombre: se mostrará con letra manuscrita como firma.",
  "esign.signature.typed_label": "Nombre completo",
};
