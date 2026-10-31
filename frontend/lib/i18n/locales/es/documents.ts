/**
 * es overlay for the documents app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale es` to draft the remainder.
 */
export const es: Record<string, string> = {
  "contracts.action.stop_waiting": "Dejar de esperar",
  "contracts.body.tokens_summary": "Campos de sustitución",
  "contracts.confirm.remove_party_body": "«{name}» se quitará del contrato junto con sus firmantes.",
  "contracts.confirm.remove_party_title": "¿Quitar esta parte?",
  "contracts.confirm.withdraw_body": "Las copias ya enviadas dejarán de poder firmarse. El motivo se mostrará a todas las partes.",
  "contracts.confirm.withdraw_title": "¿Retirar el contrato?",
  "contracts.issue.already_issued": "Ya emitido",
  "contracts.issue.create_n": "Crear {count} contratos",
  "contracts.issue.csv_row": "Fila",
  "contracts.issue.preview_counts": "{total} filas · {ok} válidas · {bad} omitidas",
  "contracts.issue.preview_hint": "Primero se lee y se muestra el archivo: no se crea ningún contrato hasta que pulse Crear.",
  "contracts.issue.preview_title": "«{file}»: vista previa",
  "contracts.issue.row_ok": "Listo",
  "contracts.issue.skipped_csv": "Descargar CSV",
  "contracts.issue.skipped_title": "Filas omitidas ({count})",
  "contracts.msg.ceremony_code": "Código de verificación {code}. Compruébelo en su teléfono y firme con el PIN2.",
  "contracts.msg.ceremony_expired": "La solicitud caducó. Vuelva a empezar.",
  "contracts.msg.ceremony_failed": "La firma no se completó.",
  "contracts.msg.ceremony_starting": "Enviando la solicitud al teléfono…",
  "contracts.msg.facts_saved": "Se guardaron los datos del contrato.",
  "contracts.msg.unsaved": "Cambios sin guardar",
  "contracts.msg.uploading": "Subiendo el archivo…",
  "contracts.send.skipped_title": "No se llegó a {count} partes",
  "contracts.step.done": "listo",
  "contracts.step.facts": "Datos",
  "contracts.step.file": "Archivo y texto",
  "contracts.step.issue": "Emisión",
  "contracts.step.label": "Pasos del contrato",
  "contracts.step.parties": "Partes",
  "contracts.step.progress": "{done} de {total} pasos listos",
  "contracts.step.send": "Envío",
  "documents.confirm.remove_step_body": "Se quitará el paso {n}, «{name}». No se guarda nada hasta que pulse Guardar.",
  "documents.confirm.remove_step_title": "¿Quitar este paso?",
};
