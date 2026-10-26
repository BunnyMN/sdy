/**
 * line — the device lines' own screens (desktop, mobile, kiosk, POS).
 *
 * These pages are drawn inside a native shell, between its ribbon and rail, so
 * they say very little — but what they do say was written straight into the
 * page in Mongolian, which an operator who had switched the app to English
 * then read in a language they had not chosen.
 *
 * "ГЭРЭГЭ" is not here: it is the product's own mark, the same in every
 * language.
 */
export const line = {
  "line.unknown.title": { mn: "Энэ шугам бүртгэлгүй", en: "This line is not registered" },
  "line.unknown.lede": {
    mn: "Хаяг нь {line} гэсэн шугамыг заасан байна. Бүртгэлтэй шугамууд {file} дотор байна.",
    en: "The address names a line called {line}. The registered lines are listed in {file}.",
  },
  "line.actions.title": { mn: "Хаанаас эхлэх", en: "Where to start" },

  "line.paiza.label": { mn: "Энэ төхөөрөмжид олгосон гэрэгэ", en: "The paiza issued to this device" },
  "line.paiza.line": { mn: "Шугам", en: "Line" },
  "line.paiza.form_factor": { mn: "Хэлбэр", en: "Form factor" },
  "line.paiza.site": { mn: "Байршил", en: "Site" },
  "line.paiza.id": { mn: "Дугаар", en: "Number" },
  "line.paiza.seal_version": { mn: "Гэрээ v{version}", en: "Contract v{version}" },
  "line.paiza.seal_none": { mn: "Олгоогүй", en: "Not issued" },
  "line.paiza.note_shell": {
    mn: "Энэ төхөөрөмж бүрхүүлээр нэвтэрсэн. Дугаар, байршлыг Тохиргоо → Төхөөрөмж дээрээс бүртгэнэ.",
    en: "This device signed in through the shell. Its number and site are recorded under Settings → Devices.",
  },
  "line.paiza.note_browser": {
    mn: "Хөтчөөр нээсэн байна. Гэрэгэ нь зөвхөн native бүрхүүлд олгогдоно.",
    en: "Opened in a browser. A paiza is issued only to the native shell.",
  },

  "line.person.title": { mn: "Нэвтэрсэн хүн", en: "Signed in as" },
  "line.person.loading": { mn: "Уншиж байна…", en: "Loading…" },
  "line.person.signed_out": {
    mn: "Нэвтрээгүй байна. Бүрхүүлээр нэвтрэхэд хүний бүртгэл энд гарч ирнэ.",
    en: "Not signed in. Sign in through the shell and the account appears here.",
  },
  "line.person.workspace": { mn: "Ажлын муж", en: "Workspace" },
  "line.person.role": { mn: "Эрх", en: "Role" },
  "line.person.admin": { mn: "Админ", en: "Administrator" },
  "line.person.member": { mn: "Гишүүн", en: "Member" },
  "line.person.organisations": { mn: "Байгууллага", en: "Organisations" },
  "line.person.sessions": { mn: "Идэвхтэй session", en: "Active sessions" },
  "line.person.joined": { mn: "Бүртгүүлсэн", en: "Joined" },
  "line.person.id": { mn: "Дугаар", en: "ID" },
  "line.person.workspace_kind": { mn: "Мужийн төрөл", en: "Workspace kind" },
  "line.person.home": { mn: "Гэрийн муж", en: "Home workspace" },
  "line.person.permissions": { mn: "Зөвшөөрөл", en: "Permissions" },
  "line.person.impersonated": { mn: "Нэрийн өмнөөс", en: "Acting on behalf" },
  "line.person.yes": { mn: "тийм", en: "yes" },
  "line.person.linked": { mn: "холбосон {when}", en: "linked {when}" },
  "line.person.last_seen": { mn: "сүүлд {when}", en: "last seen {when}" },

  "line.second.title": { mn: "2 дахь дэлгэц", en: "Second screen" },
} as const;
