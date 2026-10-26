/**
 * sso_clients — the OAuth2 / OIDC clients a tenant registers against this
 * platform's own provider, and the consent screen a user sees when one of
 * them asks to sign them in.
 */
export const sso_clients = {
  "sso_clients.view.title": { mn: "SSO клиентүүд", en: "SSO clients" },
  "sso_clients.view.subtitle": { mn: "Энэ платформоор дамжуулан нэвтрэх системүүдийн OAuth2 / OIDC клиент бүртгэл", en: "OAuth2 / OIDC clients for the systems that sign people in through this platform" },
  "sso_clients.view.create_title": { mn: "Шинэ OAuth2 client апп бүртгэх", en: "Register New OAuth2 Client App" },
  "sso_clients.view.edit_title": { mn: "Апп тохируулах", en: "Configure application" },
  "sso_clients.view.endpoints_title": { mn: "Холболтын хаягууд", en: "Connection endpoints" },
  "sso_clients.view.empty_title": { mn: "Бүртгэлтэй апп алга", en: "No applications yet" },
  "sso_clients.view.empty_body": { mn: "Гуравдагч систем Gerege-ээр дамжуулан нэвтрэхийн тулд эхлээд OAuth2 client бүртгэнэ.", en: "Register an OAuth2 client so a third-party system can sign users in through Gerege." },

  "sso_clients.field.redirect_uris": { mn: "Redirect URI-ууд", en: "Redirect URIs" },
  "sso_clients.field.post_logout_redirect_uris": { mn: "Гарсны дараах хаягууд", en: "Post-logout redirect URIs" },
  "sso_clients.hint.post_logout_redirect_uris": {
    mn: "мөр бүрт нэг · энэ апп хэрэглэгчийг гаргасны дараа буцаах хаяг",
    en: "one per line · where this app may return somebody after signing them out here",
  },
  "sso_clients.hint.redirect_uris": {
    mn: "мөр бүрт нэг · localhost-оос бусад нь зөвхөн https",
    en: "one per line · https only, except on localhost",
  },
  "sso_clients.view.provider_active": { mn: "SSO үйлчилгээ идэвхтэй", en: "Active SSO provider" },
  "sso_clients.keys.name_placeholder": { mn: "Агуулахын синк ажил", en: "Warehouse sync job" },
  "sso_clients.field.scopes": { mn: "Scope-ууд", en: "Scopes" },
  "sso_clients.field.name": { mn: "Аппын нэр", en: "Application name" },
  "sso_clients.field.client_type": { mn: "Клиентийн төрөл", en: "Client type" },
  "sso_clients.field.grant_types": { mn: "Grant төрлүүд", en: "Grant types" },
  "sso_clients.field.homepage": { mn: "Вэб хаяг", en: "Homepage URL" },
  "sso_clients.field.last_used": { mn: "Сүүлд ашигласан", en: "Last used" },
  "sso_clients.field.created": { mn: "Үүсгэсэн", en: "Created" },

  "sso_clients.type.confidential": { mn: "Нууцлагдсан (сервер талын)", en: "Confidential (server-side)" },
  "sso_clients.type.confidential_hint": { mn: "Secret хадгалж чадах backend. Secret-ийг сервер дээрээ л хадгална.", en: "A backend that can keep a secret. Store it server-side only." },
  "sso_clients.type.public": { mn: "Нээлттэй (SPA / мобайл)", en: "Public (SPA / mobile)" },
  "sso_clients.type.public_hint": { mn: "Secret өгөхгүй — хэрэглэгчийн төхөөрөмж дэх secret нь нууц биш. Оронд нь PKCE ашиглана.", en: "No secret is issued: one shipped to a user's device is not a secret. PKCE stands in for it." },

  "sso_clients.action.create": { mn: "OAuth2 client бүртгэх", en: "Register OAuth2 Client" },
  "sso_clients.action.rotate": { mn: "Secret солих", en: "Rotate secret" },
  "sso_clients.action.disable": { mn: "Идэвхгүй болгох", en: "Disable" },
  "sso_clients.action.done": { mn: "Ойлголоо", en: "Got it" },

  "sso_clients.message.loading": { mn: "OAuth2 client аппуудыг ачаалж байна...", en: "Loading OAuth2 client apps..." },
  "sso_clients.message.secret_hidden": { mn: "үүсгэх үед нэг удаа харагдана", en: "shown once, at creation" },

  "sso_clients.message.secret_once_title": { mn: "Secret-ийг одоо хуулж аваарай", en: "Copy this secret now" },
  "sso_clients.message.secret_once_body": { mn: "Бид зөвхөн хэшийг нь хадгалдаг тул энэ цонхыг хаасны дараа secret дахин харагдахгүй. Алдвал шинээр солино.", en: "Only a digest is stored, so this cannot be shown again once you close this. If you lose it, rotate for a new one." },
  "sso_clients.message.rotate_warning": { mn: "Хуучин secret тэр дороо ажиллахаа болино. Интеграцаа шинэчлэхэд бэлэн үү?", en: "The old secret stops working immediately. Ready to update your integration?" },
  "sso_clients.message.delete_warning": { mn: "Энэ аппыг устгавал түүний олгосон бүх токен, зөвшөөрөл хамт устана. Буцаах боломжгүй.", en: "Deleting this application revokes every token and consent it ever issued. This cannot be undone." },
  "sso_clients.message.disabled": { mn: "Идэвхгүй", en: "Disabled" },
  "sso_clients.message.never_used": { mn: "хараахан ашиглаагүй", en: "never used" },
  "sso_clients.message.pkce_note": { mn: "Бүх урсгалд PKCE (S256) заавал шаардана.", en: "PKCE (S256) is required on every flow." },

  // API keys — machine credentials
  "sso_clients.keys.title": { mn: "API түлхүүр", en: "API keys" },
  "sso_clients.keys.subtitle": { mn: "Хүнгүйгээр ажиллах систем хоорондын холболтын нэвтрэх мэдээлэл", en: "Credentials for system-to-system calls that run without a person" },
  "sso_clients.keys.explainer": { mn: "API түлхүүр гэдэг нь client_credentials урсгал ашигладаг нууцлагдсан client юм. Тусдаа механизм биш — та ижил client_id/secret хосыг /oauth2/token руу илгээж токен авна.", en: "An API key here is a confidential client using the client_credentials grant. It is not a separate mechanism: you exchange the same client_id/secret pair at /oauth2/token for a token." },
  "sso_clients.keys.empty": { mn: "Машины нэвтрэх мэдээлэл алга", en: "No machine credentials yet" },
  "sso_clients.keys.create": { mn: "API түлхүүр үүсгэх", en: "Create API key" },
  "sso_clients.keys.curl": { mn: "Токен авах жишээ", en: "Exchange it for a token" },

  // Access audit
  "sso_clients.audit.title": { mn: "Хандалтын аудит", en: "Access audit" },
  "sso_clients.audit.subtitle": { mn: "Танай аппуудын олгосон амьд токен ба хэрэглэгчийн зөвшөөрөл", en: "Live tokens and standing user consents your applications hold" },
  "sso_clients.audit.active_access": { mn: "Амьд access", en: "Live access" },
  "sso_clients.audit.active_refresh": { mn: "Амьд refresh", en: "Live refresh" },
  "sso_clients.audit.consented": { mn: "Зөвшөөрсөн хэрэглэгч", en: "Consented users" },
  "sso_clients.audit.revoke_tokens": { mn: "Бүх токен цуцлах", en: "Revoke all tokens" },
  "sso_clients.audit.revoke_warning": { mn: "Энэ аппын олгосон бүх амьд токен тэр дороо хүчингүй болно. Бүртгэл нь үлдэх тул интеграц дахин нэвтэрч болно.", en: "Every live token this application holds stops working immediately. The registration survives, so the integration can authenticate again." },
  "sso_clients.audit.revoked_count": { mn: "{n} токен цуцлагдлаа", en: "{n} token(s) revoked" },
  "sso_clients.audit.consents_title": { mn: "Хэрэглэгчийн зөвшөөрөл", en: "User consents" },
  "sso_clients.audit.withdraw": { mn: "Зөвшөөрөл цуцлах", en: "Withdraw" },
  "sso_clients.audit.withdraw_warning": { mn: "Энэ хэрэглэгчийн зөвшөөрөл болон түүгээр олгосон токенууд устана. Апп дараагийн удаа дахин зөвшөөрөл асууна.", en: "This user's grant and the tokens issued under it are removed. The application will ask for consent again next time." },
  "sso_clients.audit.no_consents": { mn: "Одоогоор ямар ч хэрэглэгч зөвшөөрөл өгөөгүй байна.", en: "No user has granted consent yet." },
  "sso_clients.audit.no_activity": { mn: "Аудит харуулах апп алга.", en: "No applications to audit." },

  // OAuth scopes
  "sso_clients.scopes.title": { mn: "OAuth scope", en: "OAuth scopes" },
  "sso_clients.scopes.subtitle": { mn: "Апп хэрэглэгчээс юу гуйж болох, тэдгээрийг хэн ашиглаж байгаа", en: "What an application may ask a user for, and which of yours ask for it" },
  "sso_clients.scopes.used_by": { mn: "Ашиглаж буй апп", en: "Requested by" },
  "sso_clients.scopes.unused": { mn: "хэн ч ашиглахгүй байна", en: "not requested by any application" },
  "sso_clients.scopes.sensitive_note": { mn: "Эмзэг scope нь зөвшөөрлийн дэлгэц дээр тусад нь тэмдэглэгдэнэ.", en: "Sensitive scopes are called out separately on the consent screen." },
  "sso_clients.scopes.consent_preview": { mn: "Хэрэглэгч ингэж харна:", en: "The user reads it as:" },

  // Redirect policy
  "sso_clients.redirects.title": { mn: "Redirect бодлого", en: "Redirect policies" },
  "sso_clients.redirects.subtitle": { mn: "Бүртгэлтэй бүх redirect URI ба тэдгээрийн дагах ёстой дүрэм", en: "Every registered redirect URI and the rules they have to satisfy" },
  "sso_clients.redirects.rules_title": { mn: "Хүчинтэй байх нөхцөл", en: "What is enforced" },
  "sso_clients.redirects.rule_exact": { mn: "Яг тэнцүү тааруулалт — prefix ч биш, wildcard ч биш. Тааруулалт сул байвал халдагч кодыг өөр рүүгээ хүргүүлж чадна.", en: "Exact match — not a prefix, not a wildcard. Loose matching is how an attacker has a code delivered somewhere else." },
  "sso_clients.redirects.rule_https": { mn: "localhost-оос бусад тохиолдолд заавал https.", en: "https everywhere except localhost." },
  "sso_clients.redirects.rule_fragment": { mn: "Fragment (#) агуулж болохгүй — сервер рүү илгээгддэггүй тул тааруулах боломжгүй.", en: "No fragment (#): it is never sent to the server, so it cannot be matched." },
  "sso_clients.redirects.rule_custom": { mn: "Мобайл аппын өөрийн scheme (com.example.app:/cb) зөвхөн нээлттэй клиентэд.", en: "A custom mobile scheme (com.example.app:/cb) is accepted for public clients only." },
  "sso_clients.redirects.loopback": { mn: "Loopback — зөвхөн хөгжүүлэлтэд", en: "Loopback — development only" },
  "sso_clients.redirects.none": { mn: "Бүртгэлтэй redirect URI алга.", en: "No redirect URIs registered." },
  "sso_clients.redirects.no_redirect_needed": { mn: "Зөвхөн машины урсгал — redirect шаардлагагүй", en: "Machine-only flow — no redirect needed" },

  // Signing keys
  "sso_clients.signing.title": { mn: "Гарын үсгийн түлхүүр", en: "Signing keys" },
  "sso_clients.signing.subtitle": { mn: "id_token-д гарын үсэг зурдаг түлхүүрүүд ба тэдгээрийг нийтэлдэг JWKS хаяг", en: "The keys that sign id_tokens, and the JWKS that publishes them" },
  "sso_clients.signing.explainer": { mn: "Клиент та id_token-ыг доорх JWKS-ээс түлхүүрийг татаж шалгана. Токены толгойн kid аль түлхүүрийг ашигласныг заана. Хувийн түлхүүр энд ч, API-аар ч хэзээ ч гардаггүй.", en: "A client verifies an id_token by fetching a key from the JWKS below. The token header's kid says which one was used. The private half is never shown here, nor exposed by any API." },
  "sso_clients.signing.active": { mn: "Идэвхтэй — гарын үсэг зурж байна", en: "Active — currently signing" },
  "sso_clients.signing.retired": { mn: "Тэтгэвэрт — зөвхөн шалгахад", en: "Retired — verification only" },
  "sso_clients.signing.none": { mn: "Түлхүүр хараахан үүсээгүй. Эхний id_token гаргах үед автоматаар үүснэ.", en: "No key yet. One is generated the first time an id_token is issued." },
  "sso_clients.signing.retired_note": { mn: "Тэтгэвэрт гарсан түлхүүр нь түүгээр гарын үсэг зурсан токенууд дуусах хүртэл JWKS-д үлдэнэ.", en: "A retired key stays in the JWKS until every token it signed has expired." },

  // Consent screen
  "oauth.consent.title": { mn: "Нэвтрэх зөвшөөрөл", en: "Authorize access" },
  "oauth.consent.lede": { mn: "{app} таны Gerege бүртгэлээр нэвтрэхийг хүсэж байна.", en: "{app} wants to sign you in with your Gerege account." },
  "oauth.consent.will_be_able": { mn: "Энэ апп дараахыг хийх боломжтой болно:", en: "This application will be able to:" },
  "oauth.consent.already_granted": { mn: "Өмнө нь зөвшөөрсөн", en: "Already granted" },
  "oauth.consent.sensitive": { mn: "Эмзэг", en: "Sensitive" },
  "oauth.consent.redirect_note": { mn: "Зөвшөөрвөл таныг энэ хаяг руу буцаана:", en: "If you allow this, you will be returned to:" },
  "oauth.consent.allow": { mn: "Зөвшөөрөх", en: "Allow" },
  "oauth.consent.deny": { mn: "Татгалзах", en: "Deny" },
  "oauth.consent.loading": { mn: "Хүсэлтийг шалгаж байна...", en: "Checking the request..." },
  "oauth.consent.invalid": { mn: "Энэ зөвшөөрлийн хүсэлт хүчингүй байна.", en: "This authorization request is not valid." },
} as const;
