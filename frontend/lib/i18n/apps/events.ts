import { registerDictionary, source } from "../registry";
import { events } from "../addons/events";

/**
 * The member screens' newer words sit beside the addon's rather than in it:
 * the addon file is the one the overlay check audits, and these have no
 * overlay translations yet — they fall back to English in the five optional
 * languages, which is what every app dictionary here does until translated.
 */
const member = {
  "events.message.counts_capacity": { mn: "{registered}/{capacity} бүртгүүлсэн · {attended} ирсэн", en: "{registered}/{capacity} registered · {attended} attended" },
  "events.field.ub_time": { mn: "Улаанбаатарын цагаар", en: "Ulaanbaatar time" },
  "events.action.withdraw_confirm": { mn: "Энэ арга хэмжээний бүртгэлээ цуцлах уу?", en: "Withdraw your registration for this event?" },
  "events.checkin.new_qr": { mn: "Шинэ QR", en: "New QR" },
  "events.checkin.enlarge": { mn: "Томруулж харуулах", en: "Show full screen" },
  "events.checkin.left": { mn: "Үлдсэн {time}", en: "{time} left" },
  "events.checkin.renewed": { mn: "Шинэ QR код гарлаа.", en: "A new QR code is showing." },
  "events.checkin.one_minute": { mn: "QR кодын хугацаа нэг минутын дараа дуусна; автоматаар шинэчлэгдэнэ.", en: "The QR code expires in one minute; it renews itself." },
  "events.checkin.expired": { mn: "Хугацаа дууслаа — «Шинэ QR» дарж шинэчилнэ үү.", en: "Expired — press “New QR” to renew." },
  "events.checkin.points_earned": { mn: "+{points} оноо", en: "+{points} points" },
  "events.checkin.already": { mn: "Таны ирц өмнө нь баталгаажсан байна.", en: "Your attendance was already confirmed." },
  "events.checkin.bad_link": { mn: "Энэ ирцийн холбоос бүрэн бус эсвэл буруу байна. Зохион байгуулагчийн дэлгэц дээрх QR-ийг дахин уншуулна уу.", en: "This check-in link is incomplete or wrong. Scan the QR on the organiser’s screen again." },
  "events.checkin.closed": { mn: "Энэ арга хэмжээ хаагдсан тул ирц бүртгэх боломжгүй.", en: "This event is closed, so attendance cannot be recorded." },
  "events.discussion.open_banner": { mn: "{count} асуудлаар санал хураалт явагдаж байна — санал өгөх", en: "Voting is open on {count} issue(s) — cast your vote" },
  "events.discussion.withdraw_confirm": { mn: "«{title}» асуудлыг буцаах уу?", en: "Withdraw “{title}”?" },
  "events.discussion.signing_pending": { mn: "Гарын үсэг хүлээгдэж байна.", en: "Waiting for your signature." },
  "events.discussion.signing_show": { mn: "Дэлгэрэнгүй", en: "Show" },
  "events.discussion.signing_hide": { mn: "Цонхыг хаах", en: "Hide" },
  "events.discussion.signing_stop": { mn: "Хүлээхээ болих", en: "Stop waiting" },
  "events.discussion.signing_timeout": { mn: "3 минутын дотор гарын үсэг ирсэнгүй. Дахин оролдоно уу.", en: "No signature arrived within 3 minutes. Try again." },
  "events.discussion.my_vote_signing": { mn: "Таны санал ({choice}): гарын үсэг хүлээгдэж байна", en: "Your vote ({choice}): waiting for the signature" },
  "events.discussion.my_vote_failed": { mn: "Таны санал зурагдаагүй — дахин өгнө үү.", en: "Your vote was not signed — please vote again." },
  "events.tasks.delete_confirm": { mn: "«{title}» ажлыг устгах уу?", en: "Delete the task “{title}”?" },
  "events.tasks.members_failed": { mn: "Гишүүдийн жагсаалтыг ачаалж чадсангүй, тиймээс ажил оноох боломжгүй.", en: "Could not load the member list, so tasks cannot be assigned." },
  "events.leaderboard.period": { mn: "Хугацаа", en: "Period" },
  "events.moderation.title": { mn: "Мэдээлсэн асуудлууд", en: "Reported issues" },
  "events.moderation.hint": { mn: "Гишүүд мэдээлсэн асуудлууд. Санал хураалт нээгдээгүй асуудлыг {count} гишүүн мэдээлбэл гишүүдэд нуугдана. Мэдээллийг хэрэгсэхгүй болгоход асуудал дахин харагдана; устгах шаардлагатай бол хэлэлцүүлэг дээрээс татна.", en: "Issues members reported. An issue not yet under vote that {count} members reported is hidden from members. Dismissing the reports shows it again; to remove it, withdraw it in the discussion." },
  "events.moderation.reports": { mn: "{count} мэдээлэл", en: "{count} reports" },
  "events.moderation.hidden": { mn: "Гишүүдэд нуугдсан", en: "Hidden from members" },
  "events.moderation.no_reason": { mn: "Шалтгаан бичээгүй", en: "No reason given" },
  "events.moderation.open": { mn: "Хэлэлцүүлэг рүү", en: "Open discussion" },
  "events.moderation.dismiss": { mn: "Мэдээллийг хэрэгсэхгүй болгох", en: "Dismiss reports" },
  "events.moderation.dismiss_confirm": { mn: "«{title}» асуудлын мэдээллийг хэрэгсэхгүй болгох уу?", en: "Dismiss the reports on “{title}”?" },
  "events.moderation.dismiss_reason": { mn: "Шалтгаан (заавал биш)", en: "Reason (optional)" },
  "events.moderation.dismissed": { mn: "Мэдээллийг хэрэгсэхгүй болголоо.", en: "Reports dismissed." },
};

registerDictionary("events", source({ ...events, ...member }));
