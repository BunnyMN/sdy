/**
 * base — Terms every screen shares: field labels, generic actions and
 * system messages. Nothing here belongs to one application.
 */
export const base = {
  "base.field.name": { mn: "Нэр", en: "Name" },
  "base.field.email": { mn: "И-мэйл", en: "Email" },
  "base.field.phone": { mn: "Утас", en: "Phone" },
  "base.field.company": { mn: "Байгууллага", en: "Company" },
  "base.field.status": { mn: "Төлөв", en: "Status" },
  "base.field.type": { mn: "Төрөл", en: "Type" },
  "base.field.date": { mn: "Огноо", en: "Date" },
  "base.field.language": { mn: "Хэл", en: "Language" },
  "base.field.actions": { mn: "Үйлдэл", en: "Actions" },

  "base.action.save": { mn: "Хадгалах", en: "Save" },
  "base.action.create": { mn: "Үүсгэх", en: "Create" },
  "base.action.edit": { mn: "Засах", en: "Edit" },
  "base.action.delete": { mn: "Устгах", en: "Delete" },
  "base.action.close": { mn: "Хаах", en: "Close" },
  "base.action.cancel": { mn: "Цуцлах", en: "Cancel" },
  "base.action.previous": { mn: "Өмнөх", en: "Previous" },
  "base.action.next": { mn: "Дараах", en: "Next" },
  "base.action.retry": { mn: "Дахин оролдох", en: "Try again" },
  "base.action.download": { mn: "Татаж авах", en: "Download" },
  "base.action.search": { mn: "Хайх", en: "Search" },
  "base.action.open": { mn: "Нээх", en: "Open" },

  "base.label.all": { mn: "Бүгд", en: "All" },

  "base.state.active": { mn: "Идэвхтэй", en: "Active" },
  "base.state.inactive": { mn: "Идэвхгүй", en: "Inactive" },

  "base.value.yes": { mn: "Тийм", en: "Yes" },
  "base.value.no": { mn: "Үгүй", en: "No" },

  "base.message.loading": { mn: "Ачаалж байна...", en: "Loading..." },
  "base.message.saving": { mn: "Хадгалж байна...", en: "Saving..." },
  "base.message.read_only": { mn: "Танд зөвхөн харах эрх бий. Өөрчлөлт хийхэд дараах эрх шаардана:", en: "You have read access only. Changing anything needs this permission:" },
  "base.message.admin_only_edit": { mn: "Танд зөвхөн харах эрх бий. Байгууллагын хуулийн мэдээллийг зөвхөн тенантын администратор өөрчилнө.", en: "You have read access only. The organisation's legal details are changed by a tenant administrator." },
  "base.message.admin_only_title": { mn: "Зөвхөн админд", en: "Administrators only" },
  "base.message.admin_only_body": { mn: "Энэ хэсгийг үзэхэд танай байгууллагын админ эрх шаардана. Тохиргоо → Хандалтын удирдлага хэсгээс админ эрх олгоно.", en: "This section needs tenant administrator rights. An administrator can grant them under Settings → Access control." },
  "base.message.no_data": { mn: "Одоогоор өгөгдөл алга.", en: "No data yet." },
  "base.message.error": { mn: "Алдаа гарлаа", en: "Something went wrong" },
  "base.message.page_of": { mn: "{page} / {total} хуудас", en: "Page {page} of {total}" },
  // The paged variant also names how many records the filter matched, which
  // "page 2 of 7" alone does not tell an auditor scanning a log.
  "base.message.page_summary": {
    mn: "{page} / {pages} хуудас · нийт {total}",
    en: "Page {page} of {pages} · {total} records",
  },

  // The pages a person lands on when the address is wrong or the screen threw.
  // Until these existed both were Next's own English default — a stack-trace
  // shell on a Mongolian platform, with no way back other than the browser's
  // Back button. They belong to the shell, so they sit in base.
  "base.error.not_found_title": {
    mn: "Хуудас олдсонгүй",
    en: "Page not found",
  },
  "base.error.not_found_body": {
    mn: "Хаяг буруу эсвэл энэ хуудсыг устгасан байна. Хаягаа шалгаад дахин оролдоно уу.",
    en: "The address is wrong, or this page has been removed. Check the address and try again.",
  },
  "base.error.crash_title": {
    mn: "Энэ хуудсыг нээж чадсангүй",
    en: "This page could not be opened",
  },
  "base.error.crash_body": {
    mn: "Алдааг бүртгэлээ. Дахин оролдоод үзнэ үү; давтагдвал системийн админд хандана уу.",
    en: "The error has been logged. Try again; if it keeps happening, contact your administrator.",
  },
  "base.error.home": {
    mn: "Нүүр хуудас руу",
    en: "Go to the home page",
  },

  // Installing the platform from the browser. It sits in base rather than in an
  // addon because it belongs to the shell, not to any one application.
  "pwa.install.title": {
    mn: "Апп болгон суулгах",
    en: "Install as an app",
  },
  "pwa.install.body": {
    mn: "Хөтчийн таб биш, өөрийн цонхтойгоор ажиллуулна.",
    en: "Runs in its own window instead of a browser tab.",
  },
  "pwa.install.action": {
    mn: "Суулгах",
    en: "Install",
  },
  "pwa.install.ios": {
    mn: "Хуваалцах → Нүүр дэлгэцэд нэмэх",
    en: "Share → Add to Home Screen",
  },

  // The shared primitives in components/ui: copying, confirming, one-time
  // secrets, file pickers, and the skip link every page carries.
  //
  // Then what a failed request says. A server answers in English, and an
  // operator reading Mongolian should not be handed that sentence — see
  // lib/errorMessage.ts, which is the one place these are chosen.
  "base.action.copy": { mn: "Хуулах", en: "Copy" },
  "base.action.confirm": { mn: "Батлах", en: "Confirm" },
  "base.action.done": { mn: "Болсон", en: "Done" },
  "base.action.discard": { mn: "Орхих", en: "Discard" },
  "base.action.keep_editing": { mn: "Үргэлжлүүлэн засах", en: "Keep editing" },
  "base.message.copied": { mn: "Хуулагдлаа", en: "Copied" },
  "base.message.copy_failed": { mn: "Хуулж чадсангүй. Текстийг сонгоод гараар хуулна уу.", en: "Could not copy. Select the text and copy it by hand." },
  "base.confirm.discard_title": { mn: "Өөрчлөлтийг орхих уу?", en: "Discard changes?" },
  "base.confirm.discard_body": { mn: "Бичсэн зүйл тань хадгалагдаагүй байна. Хаавал алга болно.", en: "What you typed has not been saved. Closing will lose it." },
  "base.confirm.type_to_confirm": { mn: "Баталгаажуулахын тулд «{text}» гэж бичнэ үү", en: "Type “{text}” to confirm" },
  "base.confirm.reason_required": { mn: "Шалтгаанаа бичнэ үү.", en: "Please give a reason." },
  "base.secret.once_note": { mn: "Энэ утгыг дахин харуулахгүй. Хаахаасаа өмнө хуулж, аюулгүй газар хадгална уу.", en: "This value will not be shown again. Copy it and store it safely before closing." },
  "base.secret.saved_ack": { mn: "Би үүнийг аюулгүй газар хадгалсан", en: "I have stored this somewhere safe" },
  "base.file.drop": { mn: "Файлаа энд чирч оруулна уу, эсвэл", en: "Drag a file here, or" },
  "base.file.browse": { mn: "файл сонгох", en: "choose a file" },
  "base.file.limits": { mn: "{types} · {size} хүртэл", en: "{types} · up to {size}" },
  "base.file.limit_size": { mn: "{size} хүртэл", en: "Up to {size}" },
  "base.file.too_large": { mn: "«{name}» файл {size}-аас том байна.", en: "“{name}” is larger than {size}." },
  "base.file.wrong_type": { mn: "«{name}» файлын төрлийг хүлээн авахгүй. Зөвшөөрөгдөх: {types}", en: "“{name}” is not an accepted file type. Accepted: {types}" },
  "base.file.uploading": { mn: "Илгээж байна… {percent}%", en: "Uploading… {percent}%" },
  "base.file.selected": { mn: "Сонгосон файл: {name}", en: "Selected file: {name}" },
  "base.file.remove": { mn: "Файлыг хасах", en: "Remove the file" },
  "base.a11y.skip_to_content": { mn: "Үндсэн агуулга руу шилжих", en: "Skip to main content" },
  "base.error.network": { mn: "Холболт тасарсан байна. Интернэтээ шалгаад дахин оролдоно уу.", en: "The connection dropped. Check your internet and try again." },
  "base.error.bad_request": { mn: "Илгээсэн мэдээлэл буруу байна. Талбаруудаа шалгаад дахин оролдоно уу.", en: "Some of what was sent is not valid. Check the fields and try again." },
  "base.error.unauthorized": { mn: "Таны нэвтрэлтийн хугацаа дууссан байна. Дахин нэвтэрнэ үү.", en: "Your session has ended. Please sign in again." },
  "base.error.forbidden": { mn: "Танд энэ үйлдлийг хийх эрх алга.", en: "You do not have permission to do this." },
  "base.error.not_found": { mn: "Хайсан зүйл олдсонгүй. Устгагдсан эсвэл хаяг буруу байж магадгүй.", en: "What you asked for was not found. It may have been removed." },
  "base.error.conflict": { mn: "Энэ үйлдэл одоогийн төлөвтэй зөрчилдөж байна. Хуудсаа шинэчлээд дахин оролдоно уу.", en: "This clashes with the current state. Refresh the page and try again." },
  "base.error.gone": { mn: "Энэ холбоос эсвэл хүсэлтийн хугацаа дууссан байна.", en: "This link or request has expired." },
  "base.error.too_large": { mn: "Файл эсвэл илгээсэн мэдээлэл хэт том байна.", en: "The file or request is too large." },
  "base.error.validation": { mn: "Зарим талбарын утгыг хүлээн авсангүй. Шалгаад дахин оролдоно уу.", en: "Some fields have values that were not accepted. Check them and try again." },
  "base.error.rate_limited": { mn: "Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу.", en: "Too many attempts. Wait a moment and try again." },
  "base.error.server": { mn: "Сервер дээр алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.", en: "Something went wrong on the server. Wait a moment and try again." },
  "base.error.unavailable": { mn: "Үйлчилгээ түр ажиллахгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.", en: "The service is temporarily unavailable. Try again shortly." },
  "base.error.unknown": { mn: "Алдаа гарлаа. Дахин оролдоно уу.", en: "Something went wrong. Please try again." },
  "base.error.invalid_credentials": { mn: "И-мэйл эсвэл нууц үг буруу байна.", en: "The email or password is incorrect." },
  "base.error.checkin_invalid": { mn: "Ирц бүртгэх код хүчингүй эсвэл хугацаа нь дууссан байна. Шинэ кодыг уншуулна уу.", en: "The check-in code is invalid or has expired. Scan a fresh one." },
  "base.error.checkin_not_registered": { mn: "Ирцээ бүртгүүлэхийн өмнө энэ арга хэмжээнд бүртгүүлнэ үү.", en: "Register for the event before checking in." },
  "base.error.event_full": { mn: "Энэ арга хэмжээний суудал дүүрсэн байна.", en: "This event is full." },
  "base.error.already_voted": { mn: "Та энэ асуудлаар аль хэдийн санал өгсөн байна.", en: "You have already voted on this issue." },
  "base.error.vote_closed": { mn: "Энэ асуудлын санал хураалт нээгдээгүй эсвэл хаагдсан байна.", en: "Voting on this issue is not open." },
  "base.error.eid_expired": { mn: "eID баталгаажуулалтын хугацаа дууссан. Дахин эхлүүлнэ үү.", en: "The eID session has expired. Please start again." },
  "base.error.eid_failed": { mn: "eID-аар баталгаажуулж чадсангүй. Дахин оролдоно уу.", en: "eID verification failed. Please try again." },
  "base.error.eid_unavailable": { mn: "eID үйлчилгээтэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.", en: "Could not reach the eID service. Wait a moment and try again." },
  "base.error.link_expired": { mn: "Холбоосын хугацаа дууссан эсвэл аль хэдийн ашиглагдсан байна.", en: "This link has expired or has already been used." },
} as const;
