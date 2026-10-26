/**
 * ar overlay for the reports app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale ar` to draft the remainder.
 */
export const ar: Record<string, string> = {
  "reports.app.billing": "الفوترة",
  "reports.app.contacts": "جهات الاتصال",
  "reports.app.documents": "المستندات",
  "reports.app.esign": "التوقيع الإلكتروني",
  "reports.app.inventory": "المخزون",
  "reports.app.organisation": "المؤسسة",
  "reports.app.products": "المنتجات",
  "reports.confirm.remove_schedule_body": "لن يُرسل «{name}» بعد الآن.",
  "reports.confirm.remove_schedule_title": "حذف هذا الجدول؟",
  "reports.field.frequency": "التكرار",
  "reports.field.from": "من",
  "reports.field.month_day": "يوم الشهر",
  "reports.field.time": "الوقت",
  "reports.field.to": "إلى",
  "reports.field.weekday": "يوم الأسبوع",
  "reports.field.when": "متى",
  "reports.frequency.custom": "متقدم (cron)",
  "reports.frequency.daily": "كل يوم",
  "reports.frequency.monthly": "كل شهر",
  "reports.frequency.weekly": "كل أسبوع",
  "reports.message.chart_truncated": "يعرض المخطط أول {shown} من {total} صفوف. جميعها في الجدول أدناه.",
  "reports.message.exporting": "جارٍ تجهيز الملف…",
  "reports.message.range_inverted": "تاريخ البداية بعد تاريخ النهاية.",
  "reports.preset.label": "نطاقات سريعة",
  "reports.preset.last_month": "الشهر الماضي",
  "reports.preset.this_month": "هذا الشهر",
  "reports.preset.this_quarter": "هذا الربع",
  "reports.preset.this_year": "هذا العام",
  "reports.schedule.daily_at": "كل يوم الساعة {time}",
  "reports.schedule.failed": "فشل",
  "reports.schedule.monthly_at": "في اليوم {day} من كل شهر الساعة {time}",
  "reports.schedule.weekly_at": "كل {day} الساعة {time}",
  "reports.weekday.0": "الأحد",
  "reports.weekday.1": "الاثنين",
  "reports.weekday.2": "الثلاثاء",
  "reports.weekday.3": "الأربعاء",
  "reports.weekday.4": "الخميس",
  "reports.weekday.5": "الجمعة",
  "reports.weekday.6": "السبت",
};
