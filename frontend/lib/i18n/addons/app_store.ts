/**
 * app_store — The application catalogue and what a tenant has installed.
 */
export const app_store = {
  "app_store.view.title": { mn: "Платформын Апп Дэлгүүр", en: "Platform App Store" },
  "app_store.view.subtitle": { mn: "Компиляцын үеийн бизнес модулиудыг суулгаж, идэвхжүүлж, удирдана", en: "Install, enable, and manage compile-time business modules" },
  "app_store.view.installed_title": { mn: "Суулгасан аппуудын тохиргоо", en: "Installed Apps Settings" },
  "app_store.view.search_placeholder": { mn: "Апп хайх...", en: "Search apps..." },

  "app_store.field.requires": { mn: "Шаардлага: ", en: "Requires:" },
  "app_store.field.application_name": { mn: "Аппликейшны нэр", en: "Application Name" },
  "app_store.field.module_id": { mn: "Модулийн ID", en: "Module ID" },
  "app_store.field.installed_version": { mn: "Суулгасан хувилбар", en: "Installed Version" },
  "app_store.field.installed_date": { mn: "Суулгасан огноо", en: "Installed Date" },

  "app_store.field.latest_version": { mn: "Сүүлийн хувилбар", en: "Latest version" },
  "app_store.field.updates": { mn: "Шинэчлэлт", en: "Updates" },
  "app_store.field.last_sync": { mn: "Сүүлд шалгасан", en: "Last checked" },
  "app_store.field.app_count": { mn: "{count} апп", en: "{count} apps" },

  "app_store.action.install": { mn: "Суулгах", en: "Install App" },
  "app_store.action.enable": { mn: "Идэвхжүүлэх", en: "Enable App" },
  "app_store.action.disable": { mn: "Идэвхгүй болгох", en: "Disable App" },
  "app_store.action.update": { mn: "Шинэчлэх", en: "Update" },
  "app_store.action.approve_update": { mn: "Зөвшөөрч шинэчлэх", en: "Approve and update" },

  "app_store.state.installed": { mn: "Суулгасан ба идэвхтэй", en: "Installed & Enabled" },
  "app_store.state.disabled": { mn: "Идэвхгүй", en: "Disabled" },
  // Said where the Disable button would be, so the row explains itself.
  "app_store.state.core": { mn: "Платформын бүрэлдэхүүн", en: "Part of the platform" },

  // The two layouts of the catalogue. Titles rather than visible labels: the
  // buttons are icons, and a word beside each would say twice what the icon
  // already says once.
  "app_store.action.view_grid": { mn: "Хөзрөөр харах", en: "Card view" },
  "app_store.action.view_list": { mn: "Жагсаалтаар харах", en: "List view" },
  "app_store.state.update_available": { mn: "Шинэчлэлт бэлэн", en: "Update available" },
  "app_store.state.auto_update_on": { mn: "Автоматаар шинэчилнэ", en: "Updates automatically" },
  "app_store.state.auto_update_off": { mn: "Гараар шинэчилнэ", en: "Updated by hand" },
  "app_store.state.pinned": { mn: "{version} хувилбар дээр тогтоосон", en: "Held at {version}" },
  "app_store.state.source_registry": { mn: "Каталогийг апп сторын бүртгэлээс авдаг", en: "Catalogue comes from the app registry" },
  "app_store.state.source_file": { mn: "Каталог нь энэ хувилбартай хамт ирсэн файл", en: "Catalogue is the file shipped with this release" },

  "app_store.filter.all": { mn: "Бүгд", en: "All" },

  "app_store.message.loading": { mn: "Апп каталог ачаалж байна...", en: "Loading apps catalog..." },
  "app_store.message.loading_installed": { mn: "Суулгасан аппуудыг ачаалж байна...", en: "Loading installed apps..." },
  "app_store.message.no_match": { mn: "Хайлтад тохирох апп олдсонгүй.", en: "No apps found matching your query." },

  "app_store.view.installed_subtitle": { mn: "Суулгасан модулиудыг удирдаж, төлөвийг хянаж, идэвхжүүлэх буюу идэвхгүй болгоно", en: "Manage installed tenant modules, check operational status, and enable or disable features" },

  "app_store.action.browse_store": { mn: "Апп Дэлгүүр рүү очих", en: "Go to the App Store" },

  // Two self-contained sentences rather than one split around a link. A
  // sentence cut in half translates badly: word order moves in Chinese and
  // reverses in Arabic, so the fragments no longer join up.
  "app_store.message.none_installed": { mn: "Энэ тенантад одоогоор апп суулгаагүй байна.", en: "No apps installed for this tenant yet." },
  "app_store.message.load_failed": { mn: "Аппын каталогийг ачаалж чадсангүй", en: "Failed to load the app catalog" },
  "app_store.message.action_failed": { mn: "Үйлдэл амжилтгүй боллоо", en: "Action failed" },

  // What the store says while it is working and after it has finished. The app
  // name is a variable rather than part of the sentence: it is catalogue
  // content, already translated by the API, and splicing a translated name into
  // a hand-written half-sentence is what leaves a screen half in one language.
  "app_store.message.installing": { mn: "Суулгаж байна...", en: "Installing..." },
  "app_store.message.updating": { mn: "Шинэчилж байна...", en: "Updating..." },
  "app_store.message.install_succeeded": {
    mn: "{app} болон түүний шаардлагатай аппуудыг суулгалаа.",
    en: "Installed {app} and the apps it depends on.",
  },
  "app_store.message.install_failed": { mn: "{app}-ыг суулгаж чадсангүй.", en: "Could not install {app}." },
  "app_store.message.update_succeeded": {
    mn: "{app} {version} хувилбар руу шинэчлэгдлээ.",
    en: "Updated {app} to {version}.",
  },
  "app_store.message.update_failed": { mn: "{app}-ыг шинэчилж чадсангүй.", en: "Could not update {app}." },
  "app_store.message.enabled": { mn: "{app} идэвхжлээ.", en: "Enabled {app}." },
  "app_store.message.disabled": { mn: "{app} идэвхгүй боллоо.", en: "Disabled {app}." },
  // Asked before an app is switched off, with what that does to the people
  // using it — the button alone reads like a preference, and it is not one.
  "app_store.message.confirm_disable": { mn: "{app}-ыг идэвхгүй болгох уу?", en: "Disable {app}?" },
  "app_store.message.disable_impact": {
    mn: "Байгууллагын бүх гишүүнд энэ аппын цэс, дэлгэцүүд шууд алга болж, түүнээс хамаарах ажлууд зогсоно. Өгөгдөл устахгүй — дахин идэвхжүүлэхэд хэвээрээ байна.",
    en: "Its menu and screens disappear for everyone in the organisation straight away, and anything that depends on it stops. Its data is kept, and is all there again when you re-enable it.",
  },

  // Said where the decision is made. An app whose new version asks for more
  // than the installed one is not updated on its own — the administrator is
  // shown what it added and decides.
  // A registry that has been failing for a week looks exactly like one that has
  // published nothing: the store keeps serving the catalogue it already holds.
  "app_store.message.sync_failed": {
    mn: "Сүүлийн шалгалт амжилтгүй",
    en: "The last check failed",
  },

  "app_store.message.held_for_approval": {
    mn: "Шинэ хувилбар нэмэлт эрх шаардаж байна:",
    en: "The new version asks for more:",
  },

  // What changed in the version being offered — the chronicle entry, on the
  // card where the decision to take it is made.
  "app_store.field.whats_new": { mn: "Шинэ юу байна:", en: "What's new:" },
  "app_store.action.history": { mn: "Түүх", en: "History" },

  // Only breaking and security are ever named. They are the two kinds that
  // turn an update into a decision, and a badge is how that decision reaches
  // the person making it; the remaining kinds carry no badge and so no term.
  "app_store.release_kind.security": { mn: "Аюулгүй байдал", en: "Security" },
  "app_store.release_kind.breaking": { mn: "Эвдрэлтэй өөрчлөлт", en: "Breaking" },

  // The history drawer: one timeline of what the publisher shipped and what
  // this organisation did about it.
  "app_history.view.subtitle": {
    mn: "Хувилбарын түүх ба энэ байгууллагын үйлдлүүд",
    en: "Release history, and what this organisation did about it",
  },
  "app_history.message.empty": {
    mn: "Одоогоор бичигдсэн түүх алга.",
    en: "Nothing has been recorded yet.",
  },
  "app_history.event.release": { mn: "Хувилбар гарлаа", en: "Released" },
  "app_history.event.installed": { mn: "Суулгалаа", en: "Installed" },
  "app_history.event.upgraded": { mn: "Шинэчиллээ", en: "Updated" },
  "app_history.event.held": { mn: "Хүлээлгэв", en: "Held back" },
  "app_history.event.disabled": { mn: "Идэвхгүй болголоо", en: "Disabled" },
  // A version that moved with nobody deciding is the first thing anybody asks
  // about, so the sweep is named rather than left as a blank actor.
  "app_history.actor.system": { mn: "Автомат шинэчлэлт", en: "Automatic update" },
  "app_history.actor.unknown": { mn: "Тодорхойгүй", en: "Unknown" },

  // The administrator's overview of the whole store.
  "app_store.overview.binary": { mn: "Binary", en: "Binary" },
  "app_store.overview.catalog": { mn: "Каталог", en: "Catalogue" },
  "app_store.overview.drifted": { mn: "Хувилбар зөрсөн", en: "Version drift" },
  // Drift is nobody's decision and always a fault: the catalogue this instance
  // is serving does not match the code it is running.
  "app_store.overview.drift_note": {
    mn: "Энэ build-д компилчлагдсан хувилбар каталогийнхтай таарахгүй байна. Каталог хуучирсан эсвэл build зөрүүтэй.",
    en: "The compiled version does not match the catalogue. Either the catalogue is stale or the build is.",
  },
  // A private app is offered to named platforms only. Seeing one here means
  // this deployment is one of them — which is worth saying, because nothing
  // else on the card distinguishes it from an app anybody can install.
  "app_store.label.private": { mn: "Хаалттай", en: "Private" },
  "app_store.label.category": { mn: "Ангилал", en: "Category" },
} as const;
