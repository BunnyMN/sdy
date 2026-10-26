/**
 * ru overlay for the documents app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale ru` to draft the remainder.
 */
export const ru: Record<string, string> = {
  "contracts.action.stop_waiting": "Перестать ждать",
  "contracts.body.tokens_summary": "Подстановочные поля",
  "contracts.confirm.remove_party_body": "«{name}» будет удалена из договора вместе с подписантами.",
  "contracts.confirm.remove_party_title": "Удалить эту сторону?",
  "contracts.confirm.withdraw_body": "Отправленные копии больше нельзя будет подписать. Причина будет видна всем сторонам.",
  "contracts.confirm.withdraw_title": "Отозвать договор?",
  "contracts.issue.already_issued": "Уже выпущен",
  "contracts.issue.create_n": "Создать договоров: {count}",
  "contracts.issue.csv_row": "Строка",
  "contracts.issue.preview_counts": "{total} строк · {ok} подходят · {bad} пропущено",
  "contracts.issue.preview_hint": "Сначала файл будет прочитан и показан — договоры не создаются, пока вы не нажмёте «Создать».",
  "contracts.issue.preview_title": "«{file}» — предпросмотр",
  "contracts.issue.row_ok": "Готово",
  "contracts.issue.skipped_csv": "Скачать CSV",
  "contracts.issue.skipped_title": "Пропущенные строки ({count})",
  "contracts.msg.ceremony_code": "Код подтверждения {code}. Проверьте его на телефоне и подпишите PIN2.",
  "contracts.msg.ceremony_expired": "Время запроса истекло. Начните заново.",
  "contracts.msg.ceremony_failed": "Подпись не завершена.",
  "contracts.msg.ceremony_starting": "Отправка запроса на телефон…",
  "contracts.msg.facts_saved": "Сведения договора сохранены.",
  "contracts.msg.unsaved": "Есть несохранённые изменения",
  "contracts.msg.uploading": "Загрузка файла…",
  "contracts.send.skipped_title": "Не доставлено {count} сторонам",
  "contracts.step.done": "готово",
  "contracts.step.facts": "Сведения",
  "contracts.step.file": "Файл и текст",
  "contracts.step.issue": "Рассылка",
  "contracts.step.label": "Этапы договора",
  "contracts.step.parties": "Стороны",
  "contracts.step.progress": "Готово {done} из {total} этапов",
  "contracts.step.send": "Отправка",
  "documents.confirm.remove_step_body": "Этап {n} «{name}» будет удалён. Изменения не сохранятся, пока вы не нажмёте «Сохранить».",
  "documents.confirm.remove_step_title": "Удалить этот этап?",
};
