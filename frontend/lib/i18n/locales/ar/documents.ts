/**
 * ar overlay for the documents app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale ar` to draft the remainder.
 */
export const ar: Record<string, string> = {
  "contracts.action.stop_waiting": "إيقاف الانتظار",
  "contracts.body.tokens_summary": "العناصر النائبة",
  "contracts.confirm.remove_party_body": "ستتم إزالة «{name}» من هذا العقد مع الموقّعين عنه.",
  "contracts.confirm.remove_party_title": "إزالة هذا الطرف؟",
  "contracts.confirm.withdraw_body": "لن يعود بالإمكان توقيع النسخ المرسلة. سيظهر السبب لجميع الأطراف.",
  "contracts.confirm.withdraw_title": "سحب العقد؟",
  "contracts.issue.already_issued": "صدر مسبقاً",
  "contracts.issue.create_n": "إنشاء {count} من العقود",
  "contracts.issue.csv_row": "الصف",
  "contracts.issue.preview_counts": "{total} صفوف · {ok} صالحة · {bad} متخطاة",
  "contracts.issue.preview_hint": "تتم قراءة الملف وعرضه أولاً — لن يُنشأ أي عقد قبل الضغط على «إنشاء».",
  "contracts.issue.preview_title": "«{file}» — معاينة",
  "contracts.issue.row_ok": "جاهز",
  "contracts.issue.skipped_csv": "تنزيل CSV",
  "contracts.issue.skipped_title": "الصفوف المتخطاة ({count})",
  "contracts.msg.ceremony_code": "رمز التحقق {code}. تحقق منه على هاتفك ثم وقّع باستخدام PIN2.",
  "contracts.msg.ceremony_expired": "انتهت مهلة الطلب. يُرجى البدء من جديد.",
  "contracts.msg.ceremony_failed": "لم يكتمل التوقيع.",
  "contracts.msg.ceremony_starting": "جارٍ إرسال الطلب إلى الهاتف…",
  "contracts.msg.facts_saved": "تم حفظ تفاصيل العقد.",
  "contracts.msg.unsaved": "تغييرات غير محفوظة",
  "contracts.msg.uploading": "جارٍ رفع الملف…",
  "contracts.send.skipped_title": "لم يصل إلى {count} من الأطراف",
  "contracts.step.done": "مكتمل",
  "contracts.step.facts": "التفاصيل",
  "contracts.step.file": "الملف والنص",
  "contracts.step.issue": "الإصدار",
  "contracts.step.label": "خطوات العقد",
  "contracts.step.parties": "الأطراف",
  "contracts.step.progress": "{done} من {total} خطوات جاهزة",
  "contracts.step.send": "الإرسال",
  "documents.confirm.remove_step_body": "ستُزال الخطوة {n} «{name}». لن يُحفظ شيء حتى تضغط «حفظ».",
  "documents.confirm.remove_step_title": "إزالة هذه الخطوة؟",
};
