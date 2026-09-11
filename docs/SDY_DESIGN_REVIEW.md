# SDY гишүүний UI — Gerege Design Research

Эх сурвалж: [Gerege Design Research](https://gerege-systems.github.io/design-research/),
2026-09-11-нд уншсан 00–15 дүрэм. Defaults, semantic token, dashboard болон
mobile/PWA бүлгийг гишүүний үндсэн урсгалд хэрэглэв. References хавтас тухайн
үед жишиг зураггүй байсан; шинэ bitmap зураг шаардлагагүй.

## Хэрэгжүүлсэн хүрээ

- Гишүүний нүүр, ирц/оноо, хураамж, элсэлт/шилжилт шийдвэрлэх, санхүү болон
  үйл ажиллагааны дэлгэцийн зай, карт, бичгийн шатлалыг нэгтгэв.
- Гишүүн, Events, Profile хэсэгт тусдаа MemberShell: байгууллагын нэр,
  240px desktop sidebar, утас/таблетын 56px + safe-area доод цэс, буцах холбоос.
  **Touch-first PWA учраас доод цэсийг 1024px хүртэл хэрэглэнэ.**
- Формын өргөн 720px, card padding 16/24px, control/card radius 6/8px.
  Товчны хүрэх талбай 44px; утасны form font 16px. Neutral surface,
  Geist кирилл, weight 400/500/600, light/dark semantic token.
- Шилжилтийн pending/success/declined төлөв тексттэй semantic өнгөөр;
  шийдвэр, цуцлалтын өмнө хүн ба байгууллагаа нягтлах modal. Manager-ийн
  permission-denied дэлгэц тайлбар, буцах холбоостой.
- SPA title, h1 focus, screen-reader announcement, skip link; offline тайлбар;
  keyboard нээгдэхэд доод цэс нуугдана; reduced motion болон print загвар.
- Мөнгө `25,000₮`, огноо `yyyy-MM-dd HH:mm` (Asia/Ulaanbaatar).
- Нэвтрэх карт 440px, 16/24px зай, semantic light/dark өнгө, харагдах field label.

## Баталгаажуулалт

Playwright-ийн member-pwa тестүүд 320/768/1280px, light/dark, overflow,
44px tab target, input 16px, title/focus/back, хүсэлт гаргах/цуцлах/admin
батлах урсгалыг шалгана. Бодит RLS болон санхүүгийн түүх Go integration
тестээр шалгагдана; браузерын тестийн API нь fixture.

Энэ нь бүх платформ, бүх legacy модульд design checklist бүрэн хангасан
гэсэн дүгнэлт биш. Нийтийн marketing landing, operator console болон бусад
модулийн дотоод загвар тусдаа. Үйлдлийн статистикийн бодит Core Web Vitals,
физик iPhone keyboard/VoiceOver, eID аппын зөвшөөрлийг төхөөрөмж дээр хүлээн
авах шалгалт үлдэнэ. Хувийн өгөгдлийг offline draft болгон хадгалахгүй.

GitHub Actions 2026-09-11-нд account billing/spending limit-ийн шалтгаанаар
runner эхлүүлэхгүй болсон. Локал test/lint/build-ийн үр дүн болон production
шинэчлэлтийн commit-ийг deployment тэмдэглэлтэй хамт хадгална.

Локал баталгаажуулалт: PostgreSQL + Redis бүхий бүтэн Go race suite —
799 тест, 61 package PASS, SKIP 0; go vet болон CI-тэй ижил golangci-lint
v2.1.6 — 0 issues. Frontend 198 unit, 23 Playwright тест PASS. TypeScript,
API boundary болон Next production webpack build амжилттай.
