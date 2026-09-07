/**
 * events — Арга хэмжээ ба ирц (mn.sdy.events). Байгууллага арга хэмжээ
 * зарлана, гишүүд бүртгүүлнэ, зохион байгуулагч хэн ирснийг тэмдэглэнэ.
 */
export const events = {
  "events.view.title": { mn: "Арга хэмжээ", en: "Events" },
  "events.view.subtitle": {
    mn: "Байгууллагын арга хэмжээ, бүртгэл ба ирц. Гишүүн өөрөө бүртгүүлнэ, зохион байгуулагч ирцийг тэмдэглэнэ.",
    en: "The organisation's events, registrations and attendance. Members register themselves; the organiser marks who came.",
  },
  "events.view.new_title": { mn: "Шинэ арга хэмжээ", en: "New event" },
  "events.view.edit_title": { mn: "Арга хэмжээ засах", en: "Edit event" },
  "events.view.participants": { mn: "Оролцогчид", en: "Participants" },
  "events.view.add_participant": { mn: "Оролцогч нэмэх", en: "Add a participant" },
  "events.view.upcoming": { mn: "Удахгүй болох", en: "Upcoming" },
  "events.view.past": { mn: "Өнгөрсөн", en: "Past" },

  "events.field.title": { mn: "Нэр", en: "Title" },
  "events.field.description": { mn: "Тайлбар", en: "Description" },
  "events.field.location": { mn: "Байршил", en: "Location" },
  "events.field.starts_at": { mn: "Эхлэх", en: "Starts" },
  "events.field.ends_at": { mn: "Дуусах", en: "Ends" },
  "events.field.capacity": { mn: "Хүний дээд тоо", en: "Capacity" },
  "events.field.capacity_hint": { mn: "хоосон бол хязгааргүй", en: "blank means no limit" },
  "events.field.status": { mn: "Төлөв", en: "Status" },
  "events.field.note": { mn: "Тэмдэглэл", en: "Note" },
  "events.field.member": { mn: "Гишүүн", en: "Member" },

  "events.status.planned": { mn: "Товлогдсон", en: "Planned" },
  "events.status.done": { mn: "Болсон", en: "Done" },
  "events.status.cancelled": { mn: "Цуцлагдсан", en: "Cancelled" },
  "events.status.all": { mn: "Бүгд", en: "All" },

  "events.attendance.registered": { mn: "Бүртгүүлсэн", en: "Registered" },
  "events.attendance.attended": { mn: "Ирсэн", en: "Attended" },
  "events.attendance.absent": { mn: "Ирээгүй", en: "Absent" },

  "events.action.create": { mn: "Арга хэмжээ нэмэх", en: "Add an event" },
  "events.action.save": { mn: "Хадгалах", en: "Save" },
  "events.action.cancel": { mn: "Болих", en: "Cancel" },
  "events.action.edit": { mn: "Засах", en: "Edit" },
  "events.action.register": { mn: "Бүртгүүлэх", en: "Register" },
  "events.action.withdraw": { mn: "Бүртгэлээ цуцлах", en: "Withdraw" },
  "events.action.mark_attended": { mn: "Ирсэн", en: "Came" },
  "events.action.mark_absent": { mn: "Ирээгүй", en: "Did not come" },
  "events.action.mark_registered": { mn: "Буцаах", en: "Undo" },
  "events.action.add": { mn: "Нэмэх", en: "Add" },
  "events.action.back": { mn: "Жагсаалт руу", en: "Back to the list" },

  "events.message.empty": {
    mn: "Одоогоор арга хэмжээ алга. Эхнийхийг нэмээд гишүүддээ зарлаарай.",
    en: "No events yet. Add the first one and tell the members.",
  },
  "events.message.no_participants": {
    mn: "Хэн ч бүртгүүлээгүй байна.",
    en: "Nobody has registered yet.",
  },
  "events.message.registered": { mn: "Та бүртгүүллээ.", en: "You are registered." },
  "events.message.my_status": { mn: "Таны төлөв", en: "Your status" },
  "events.message.full": { mn: "Хүний тоо дүүрсэн", en: "Full" },
  "events.message.counts": { mn: "{registered} бүртгүүлсэн · {attended} ирсэн", en: "{registered} registered · {attended} attended" },
  "events.message.loading": { mn: "Ачаалж байна…", en: "Loading…" },
  "events.message.not_found": { mn: "Ийм арга хэмжээ олдсонгүй.", en: "No such event." },
  "events.message.read_only": {
    mn: "Та арга хэмжээг харж, бүртгүүлж болно. Шинээр нэмэх, ирц тэмдэглэхэд менежерийн эрх хэрэгтэй.",
    en: "You can see events and register. Adding one or marking attendance needs the manager permission.",
  },
} as const;
