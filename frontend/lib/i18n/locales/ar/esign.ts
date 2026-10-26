/**
 * ar overlay for the esign app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale ar` to draft the remainder.
 */
export const ar: Record<string, string> = {
  "esign.action.cancel_batch": "إلغاء الدفعة",
  "esign.action.keep_batch": "الإبقاء",
  "esign.action.preview_document": "عرض المستند",
  "esign.action.undo": "تراجع",
  "esign.confirm.cancel_batch_body": "سيتم تخطي المستندات غير الموقعة في «{name}». تبقى الموقعة كما هي. لا يمكن التراجع عن ذلك.",
  "esign.confirm.cancel_batch_title": "إلغاء هذه الدفعة؟",
  "esign.eid.confirm_note": "بمجرد الضغط على «ابدأ» يُرسل المستند إلى eID Mongolia ويصل طلب تأكيد إلى هاتفك.",
  "esign.eid.confirm_title": "تحقق قبل الإرسال",
  "esign.eid.expires_in": "تنتهي خلال {time}",
  "esign.eid.expires_in_minutes": "تبقّى نحو {minutes} دقائق",
  "esign.eid.expiring": "ينتهي الآن…",
  "esign.eid.open_preview": "فتح في علامة تبويب جديدة",
  "esign.eid.pick_other": "اختيار ملف آخر",
  "esign.eid.preview_unavailable": "لا يستطيع هذا المتصفح عرض ملف PDF هنا.",
  "esign.eid.size": "الحجم",
  "esign.eid.start": "بدء التوقيع",
  "esign.eid.step_check": "تحقق",
  "esign.eid.step_compare_code": "تأكد من أن الرمز في التطبيق يطابق الرمز المعروض هنا تماماً.",
  "esign.eid.step_done": "مكتمل",
  "esign.eid.step_download": "تنزيل",
  "esign.eid.step_open_app": "افتح تطبيق eID Mongolia على هاتفك.",
  "esign.eid.step_phone": "التأكيد على الهاتف",
  "esign.eid.step_pick": "اختيار",
  "esign.eid.steps_label": "خطوات التوقيع",
  "esign.field.placement_box": "مربع التوقيع",
  "esign.message.item_failed": "تعذّر توقيع هذا المستند.",
  "esign.message.placement_box_label": "مربع التوقيع: X {x}، Y {y}، العرض {width}، الارتفاع {height} نقطة",
  "esign.message.placement_drag_hint": "اسحب المربع لتحريكه واسحب زاويته لتغيير حجمه. تحرّكه الأسهم نقطة واحدة (Shift: ‏10)؛ ‏Alt مع الأسهم يغيّر الحجم.",
  "esign.message.probe_failed": "تعذّر الوصول إلى HSM.",
  "esign.message.probe_ok": "الاتصال بـ HSM يعمل.",
  "esign.signature.draw_hint": "ارسم توقيعك في المربع الأبيض بالفأرة أو الإصبع أو القلم. النقرة تترك نقطة؛ «تراجع» يحذف آخر خط.",
  "esign.signature.mode": "طريقة التوقيع",
  "esign.signature.mode_draw": "رسم",
  "esign.signature.mode_type": "كتابة الاسم",
  "esign.signature.type_hint": "إذا تعذّر الرسم، اكتب اسمك — سيُعرض بخط يدوي كتوقيع.",
  "esign.signature.typed_label": "الاسم الكامل",
};
