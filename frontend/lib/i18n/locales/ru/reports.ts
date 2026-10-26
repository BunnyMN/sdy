/**
 * ru overlay for the reports app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale ru` to draft the remainder.
 */
export const ru: Record<string, string> = {
  "reports.app.billing": "Счета",
  "reports.app.contacts": "Контакты",
  "reports.app.documents": "Документы",
  "reports.app.esign": "Электронная подпись",
  "reports.app.inventory": "Склад",
  "reports.app.organisation": "Организация",
  "reports.app.products": "Товары",
  "reports.confirm.remove_schedule_body": "Отчёт «{name}» больше не будет отправляться.",
  "reports.confirm.remove_schedule_title": "Удалить это расписание?",
  "reports.field.frequency": "Периодичность",
  "reports.field.from": "С",
  "reports.field.month_day": "День месяца",
  "reports.field.time": "Время",
  "reports.field.to": "По",
  "reports.field.weekday": "День недели",
  "reports.field.when": "Когда",
  "reports.frequency.custom": "Расширенно (cron)",
  "reports.frequency.daily": "Каждый день",
  "reports.frequency.monthly": "Каждый месяц",
  "reports.frequency.weekly": "Каждую неделю",
  "reports.message.chart_truncated": "На графике первые {shown} из {total} строк. Все они есть в таблице ниже.",
  "reports.message.exporting": "Подготовка файла…",
  "reports.message.range_inverted": "Дата начала позже даты окончания.",
  "reports.preset.label": "Быстрый выбор",
  "reports.preset.last_month": "Прошлый месяц",
  "reports.preset.this_month": "Этот месяц",
  "reports.preset.this_quarter": "Этот квартал",
  "reports.preset.this_year": "Этот год",
  "reports.schedule.daily_at": "Каждый день в {time}",
  "reports.schedule.failed": "Ошибка",
  "reports.schedule.monthly_at": "{day}-го числа каждого месяца в {time}",
  "reports.schedule.weekly_at": "Каждый {day} в {time}",
  "reports.weekday.0": "воскресенье",
  "reports.weekday.1": "понедельник",
  "reports.weekday.2": "вторник",
  "reports.weekday.3": "среда",
  "reports.weekday.4": "четверг",
  "reports.weekday.5": "пятница",
  "reports.weekday.6": "суббота",
};
