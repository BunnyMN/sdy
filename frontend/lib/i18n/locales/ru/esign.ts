/**
 * ru overlay for the esign app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale ru` to draft the remainder.
 */
export const ru: Record<string, string> = {
  "esign.action.cancel_batch": "Отменить пакет",
  "esign.action.keep_batch": "Оставить",
  "esign.action.preview_document": "Просмотреть документ",
  "esign.action.undo": "Отменить",
  "esign.confirm.cancel_batch_body": "Неподписанные документы пакета «{name}» будут пропущены. Подписанные останутся подписанными. Это нельзя отменить.",
  "esign.confirm.cancel_batch_title": "Отменить этот пакет?",
  "esign.eid.confirm_note": "После нажатия «Начать» документ отправится в eID Mongolia, а на ваш телефон придёт запрос на подтверждение.",
  "esign.eid.confirm_title": "Проверьте перед отправкой",
  "esign.eid.expires_in": "Истекает через {time}",
  "esign.eid.expires_in_minutes": "Осталось около {minutes} мин.",
  "esign.eid.expiring": "Срок истекает…",
  "esign.eid.open_preview": "Открыть в новой вкладке",
  "esign.eid.pick_other": "Выбрать другой файл",
  "esign.eid.preview_unavailable": "Этот браузер не может показать PDF здесь.",
  "esign.eid.size": "Размер",
  "esign.eid.start": "Начать подписание",
  "esign.eid.step_check": "Проверка",
  "esign.eid.step_compare_code": "Убедитесь, что код в приложении точно совпадает с кодом здесь.",
  "esign.eid.step_done": "выполнено",
  "esign.eid.step_download": "Скачать",
  "esign.eid.step_open_app": "Откройте приложение eID Mongolia на телефоне.",
  "esign.eid.step_phone": "Подтверждение на телефоне",
  "esign.eid.step_pick": "Выбор",
  "esign.eid.steps_label": "Этапы подписания",
  "esign.field.placement_box": "область подписи",
  "esign.message.item_failed": "Этот документ не удалось подписать.",
  "esign.message.placement_box_label": "Область подписи: X {x}, Y {y}, ширина {width}, высота {height} pt",
  "esign.message.placement_drag_hint": "Перетащите область, чтобы переместить, или её угол, чтобы изменить размер. Стрелки сдвигают на 1 pt (Shift — 10); Alt+стрелки меняют размер.",
  "esign.message.probe_failed": "Не удалось связаться с HSM.",
  "esign.message.probe_ok": "Соединение с HSM работает.",
  "esign.signature.draw_hint": "Нарисуйте подпись в белом поле мышью, пальцем или стилусом. Касание оставляет точку; «Отменить» убирает последний штрих.",
  "esign.signature.mode": "Способ подписи",
  "esign.signature.mode_draw": "Нарисовать",
  "esign.signature.mode_type": "Ввести имя",
  "esign.signature.type_hint": "Если не можете нарисовать, введите имя — оно будет оформлено рукописным шрифтом как подпись.",
  "esign.signature.typed_label": "Фамилия и имя",
};
