/**
 * reports — The reporting screen.
 *
 * Deliberately short. Almost every word on that screen — the report's name, its
 * parameters, its column headings — comes from the server, because the report
 * that owns them lives in a Go module and this file cannot know what reports a
 * deployment has. What is here is the chrome around them.
 */
export const reports = {
  "reports.view.title": { mn: "Тайлан", en: "Reports" },
  "reports.view.subtitle": {
    mn: "Байгууллагын суулгасан аппуудын тайлан. Ажиллуулах, график харах, Excel/CSV болгон гаргах.",
    en: "The reports of the apps this organisation has installed. Run them, chart them, export them.",
  },

  "reports.section.reports": { mn: "Тайлангууд", en: "Reports" },
  "reports.section.schedules": { mn: "Товлосон тайлан", en: "Scheduled reports" },
  "reports.section.parameters": { mn: "Үзүүлэлт", en: "Parameters" },
  "reports.section.chart": { mn: "График", en: "Chart" },

  "reports.action.run": { mn: "Ажиллуулах", en: "Run" },
  "reports.action.export_xlsx": { mn: "Excel", en: "Excel" },
  "reports.action.export_csv": { mn: "CSV", en: "CSV" },
  "reports.action.schedule": { mn: "Товлох", en: "Schedule" },
  "reports.action.new_schedule": { mn: "Шинэ хуваарь", en: "New schedule" },

  "reports.field.total": { mn: "Нийт", en: "Total" },
  "reports.field.rows": { mn: "мөр", en: "rows" },
  "reports.field.schedule_name": { mn: "Хуваарийн нэр", en: "Schedule name" },
  "reports.field.cron": { mn: "Хуваарь (cron)", en: "Schedule (cron)" },
  "reports.field.format": { mn: "Хэлбэр", en: "Format" },
  "reports.field.recipients": { mn: "Хүлээн авагчид", en: "Recipients" },
  "reports.field.last_run": { mn: "Сүүлд ажилласан", en: "Last run" },
  "reports.field.report": { mn: "Тайлан", en: "Report" },

  "reports.hint.cron": {
    mn: "Минут цаг өдөр сар гараг. Жишээ: сарын 1-нд 09:00 цагт бол «0 9 1 * *»",
    en: "Minute hour day month weekday. For the 1st of the month at 09:00: “0 9 1 * *”",
  },
  "reports.hint.recipients": {
    mn: "И-мэйл хаягуудыг таслалаар тусгаарлана.",
    en: "E-mail addresses, separated by commas.",
  },

  "reports.message.select": { mn: "Зүүн талаас тайлан сонгоно уу.", en: "Choose a report on the left." },
  "reports.message.empty": { mn: "Энэ хугацаанд өгөгдөл алга.", en: "No data for this period." },
  "reports.message.no_reports": {
    mn: "Тайлантай апп суулгаагүй байна. Апп сторооос апп суулгасны дараа түүний тайлангууд энд гарч ирнэ.",
    en: "No app with reports is installed. Install one from the store and its reports appear here.",
  },
  "reports.message.no_schedules": { mn: "Товлосон тайлан алга.", en: "No scheduled reports." },
  "reports.message.running": { mn: "Тайлан бэлтгэж байна...", en: "Producing the report…" },
  "reports.message.run_failed": { mn: "Тайлан ажиллуулж чадсангүй", en: "The report could not be produced" },
  "reports.message.export_failed": { mn: "Гаргаж чадсангүй", en: "The export failed" },
  "reports.message.schedule_saved": { mn: "Хуваарь хадгалагдлаа.", en: "The schedule was saved." },
  "reports.message.schedule_removed": { mn: "Хуваарь устгагдлаа.", en: "The schedule was removed." },
  "reports.action.run_consolidated": { mn: "Нэгдсэн", en: "Consolidated" },
  "reports.badge.consolidated": { mn: "Нэгдсэн", en: "Consolidated" },
  "reports.toggle.by_company": { mn: "Компаниар задлах", en: "Break down by organisation" },
  "reports.hint.consolidated": {
    mn: "Танд энэ тайланг хуваалцсан байгууллага бүрийн дүн. Хуваалцаагүй бол юу ч харагдахгүй — Тохиргоо → Тайлан хуваалцах.",
    en: "The figures of every organisation that shares this report with you. Nothing is shown without an agreement — Settings → Report sharing.",
  },
  "reports.message.delivery_off": {
    mn: "Энэ суулгацад и-мэйл илгээх тохиргоо байхгүй тул товлосон тайлан бэлтгэгдэх боловч илгээгдэхгүй. REPORT_SMTP_URL-ийг тохируулна уу.",
    en: "This deployment has no mail transport, so a scheduled report is produced but not delivered. Set REPORT_SMTP_URL.",
  },

  // ─── App names (group headings) ────────────────────────────────────────────
  "reports.app.organisation": { mn: "Байгууллага", en: "Organisation" },
  "reports.app.billing": { mn: "Нэхэмжлэх", en: "Billing" },
  "reports.app.inventory": { mn: "Агуулах", en: "Inventory" },
  "reports.app.esign": { mn: "Цахим гарын үсэг", en: "E-signature" },
  "reports.app.documents": { mn: "Баримт бичиг", en: "Documents" },
  "reports.app.contacts": { mn: "Харилцагч", en: "Contacts" },
  "reports.app.products": { mn: "Бараа", en: "Products" },

  // ─── Date range ────────────────────────────────────────────────────────────
  "reports.field.from": { mn: "Эхлэх огноо", en: "From" },
  "reports.field.to": { mn: "Дуусах огноо", en: "To" },
  "reports.preset.label": { mn: "Түргэн сонголт", en: "Quick ranges" },
  "reports.preset.this_month": { mn: "Энэ сар", en: "This month" },
  "reports.preset.last_month": { mn: "Өнгөрсөн сар", en: "Last month" },
  "reports.preset.this_quarter": { mn: "Энэ улирал", en: "This quarter" },
  "reports.preset.this_year": { mn: "Энэ он", en: "This year" },
  "reports.message.range_inverted": {
    mn: "Эхлэх огноо дуусах огнооноос хойш байна.",
    en: "The start date is after the end date.",
  },
  "reports.message.chart_truncated": {
    mn: "Графикт эхний {shown} мөрийг харуулав (нийт {total}). Бүгд доорх хүснэгтэд байна.",
    en: "The chart shows the first {shown} of {total} rows. All of them are in the table below.",
  },
  "reports.message.exporting": { mn: "Файл бэлтгэж байна…", en: "Preparing the file…" },

  // ─── Schedules ─────────────────────────────────────────────────────────────
  "reports.field.when": { mn: "Хэзээ", en: "When" },
  "reports.field.frequency": { mn: "Давтамж", en: "How often" },
  "reports.field.time": { mn: "Цаг", en: "Time" },
  "reports.field.weekday": { mn: "Гараг", en: "Day of the week" },
  "reports.field.month_day": { mn: "Сарын өдөр", en: "Day of the month" },
  "reports.frequency.daily": { mn: "Өдөр бүр", en: "Every day" },
  "reports.frequency.weekly": { mn: "7 хоног бүр", en: "Every week" },
  "reports.frequency.monthly": { mn: "Сар бүр", en: "Every month" },
  "reports.frequency.custom": { mn: "Дэлгэрэнгүй (cron)", en: "Advanced (cron)" },
  "reports.schedule.daily_at": { mn: "Өдөр бүр {time}", en: "Every day at {time}" },
  "reports.schedule.weekly_at": { mn: "{day} бүр {time}", en: "Every {day} at {time}" },
  "reports.schedule.monthly_at": { mn: "Сар бүрийн {day}-нд {time}", en: "On day {day} of every month at {time}" },
  "reports.schedule.failed": { mn: "Амжилтгүй", en: "Failed" },
  "reports.weekday.1": { mn: "Даваа", en: "Monday" },
  "reports.weekday.2": { mn: "Мягмар", en: "Tuesday" },
  "reports.weekday.3": { mn: "Лхагва", en: "Wednesday" },
  "reports.weekday.4": { mn: "Пүрэв", en: "Thursday" },
  "reports.weekday.5": { mn: "Баасан", en: "Friday" },
  "reports.weekday.6": { mn: "Бямба", en: "Saturday" },
  "reports.weekday.0": { mn: "Ням", en: "Sunday" },
  "reports.confirm.remove_schedule_title": { mn: "Хуваарийг устгах уу?", en: "Delete this schedule?" },
  "reports.confirm.remove_schedule_body": {
    mn: "«{name}» тайлан цаашид илгээгдэхгүй.",
    en: "“{name}” will no longer be sent.",
  },
} as const;
