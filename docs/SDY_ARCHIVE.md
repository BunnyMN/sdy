# Гарын үсэгтэй архив ба PDF саналын хуудас — API (native апп)

`mn.sdy.events` `1.7.0`. iOS/Android аппад архив, PDF саналын хуудас нэмэхэд
шаардлагатай endpoint ба урсгал. Вэб (`/member/archive`) яг эдгээрийг ашиглана.
Ерөнхий тайлбар: [МЗХ](MZH.md#гарын-үсэгтэй-архив--mnsdyevents-170).

[Баримтын төв](README.md) · [Баримт ба гарын үсэг](SIGNING.md)

---

## Санал өгөх — гэрээ өөрчлөгдөөгүй

`POST /api/v1/events/{id}/motions/{motionID}/vote` `{choice, callback_url?}` → 202
`{session_id, verification_code, app_link, state: "signing"}` ба
`POST …/vote/poll` `{session_id?}` → 200 `{state, points}` хэвээр. Дотор нь:

- Сервер **саналын хуудас PDF** үүсгэж, түүнийг eID-д PDF-ээр өгнө (`RailSignatureOnly`).
  `digest_hex` нь тэр PDF-ийн SHA-256; PIN2 дэлгэц дээр «Санал: Зөвшөөрөв — <асуудал>» гарна.
- Санал нь eID-ийн баталгаажуулсан digest-ээр тоологдоно (өмнөх шигээ). eID-ийн тамгалсан
  PAdES PDF тэр мөчид ирээгүй бол санал тоологдсон хэвээр, дараагийн poll (≤30 мин) түүнийг хавсаргана.
- eID нь зөвхөн digest зурдаг бол (PDF гарын үсэг боломжгүй) ижил PDF-ийн digest-ийг зурна.

Шинэ талбарууд (нэмэлт, хуучин апп эвдэхгүй):

| Хаана | Талбар | Утга |
| --- | --- | --- |
| `Motion` | `protocol_id: string \| null` | Шийдэгдсэн асуудлын протокол (архивын баримт), төсөл биш үед |
| `Motion.my_vote` | `ballot: bool` | Зурсан саналын PDF хадгалагдсан |
| `Motion.my_vote` | `ballot_signed: bool` | PDF нь eID-ийн PAdES гарын үсэгтэй |

Саналын хуудас татах (`application/pdf`, `?inline=1` бол inline):

- `GET /api/v1/events/{id}/motions/{motionID}/ballot` — өөрийн зурсан саналын хуудас; байхгүй бол 404.
- `GET /api/v1/events/{id}/motions/{motionID}/votes/{userID}/ballot` — менежер үргэлж, гишүүн
  асуудал шийдэгдсэний дараа (нэрсийн жагсаалттай ижил дүрэм); өөр үед 403.
- Толгой: `X-Ballot-Signature: pades` (eID-ийн гарын үсэг PDF дотор) эсвэл `digest` (PDF-ийн
  SHA-256-г eID-ээр зурсан, PDF өөрөө гарын үсэггүй); `X-Document-SHA256`.

## Архив

Эрх: `archive.read` — салбарын гишүүн бүр (жагсаалт, харах, өөрт ирснийг зурах);
`archive.manage` — Тэргүүн, Нарийн бичиг, админ. Төсөл (`draft`) зөвхөн `archive.manage`-д харагдана
(бусдад 404). Олон нийтэд нээлттэй шалгах хуудас байхгүй.

### Төрлүүд

```
ArchiveDocument {
  id, kind: "minutes"|"decision"|"vote_protocol", kind_title, number: "2026/014" ("" төсөлд),
  title, body, event_id|null, event_title, motion_id|null,
  status: "draft"|"signing"|"signed"|"cancelled", draft_reason: ""|"no_signers",
  created_by, created_by_name, created_at, updated_at, issued_at|null, signed_at|null,
  cancelled_at|null, cancel_reason, pdf_sha256, final_sha256,
  signer_count, signed_count, revisions, current_signer|null, my_turn: bool,
  signers?: [ArchiveSigner], versions?: [ArchiveVersion], can_manage: bool
}
ArchiveSigner { user_id, name, position_title, order, status: "pending"|"signing"|"signed"|"refused",
  signed_at|null, cert_name, cert_serial, cert_issuer, has_eid, current, last_error? }
ArchiveVersion { revision, sha256, size, signer_user_id|null, signer_name, created_at }
```

`last_error` нь зөвхөн тухайн зурагч өөрт ба менежерт харагдана.

### Endpoint

| Method | Зам | Эрх | Хүсэлт → хариу |
| --- | --- | --- | --- |
| GET | `/api/v1/archive` | read | `?kind=&status=&mine=todo\|signer&event_id=&offset=` → `{documents, has_more, next_offset, todo, can_manage, signing_ready}` (50/хуудас, `body` хоосон) |
| POST | `/api/v1/archive` | manage | `{kind: minutes\|decision, title, body, event_id?, signers: [user_id…]}` → 201 `{document}` |
| GET | `/api/v1/archive/signers` | manage | `?q=` → `{board, officers, members}` — `{user_id, name, email, position, position_title, has_eid}` |
| GET | `/api/v1/archive/{docID}` | read | → `{document (signers, versions-тэй), signing_ready}` |
| PUT | `/api/v1/archive/{docID}` | manage | төсөлд л; POST-той ижил бие → `{document}`. Протоколд зөвхөн `signers` өөрчлөгдөнө |
| POST | `/api/v1/archive/{docID}/send` | manage | → `{document}` (status `signing`, дугаар, revision 0) |
| POST | `/api/v1/archive/{docID}/cancel` | manage | `{reason}` (`signing` үед заавал) → `{document}` |
| GET | `/api/v1/archive/{docID}/pdf` | read | `?revision=N&inline=1` → `application/pdf` (сүүлийн хувилбар анхдагч; төсөлд менежерт «ТӨСӨЛ» урьдчилсан харагдац) |
| POST | `/api/v1/archive/{docID}/sign` | read | `{callback_url?}` → 202 `{session_id, verification_code, app_link, state: "signing"}` |
| POST | `/api/v1/archive/{docID}/sign/poll` | read | `{session_id?}` → 200 `{state, document_status, reason?}` |
| POST | `/api/v1/events/{id}/motions/{motionID}/protocol` | events.manage | хаалтын үед протокол үүсч чадаагүй бол дахин үүсгэнэ → 201 `{document}`; байгаа бол 409 |

`state`: `signing` (PIN2 хүлээж байна — 2–3 секунд тутам дахин poll), `signed`, `failed`
(`reason`: `rejected`, `expired`, `failed`, `refused…`; «Дахин оролдох» → шинэ `…/sign`), `pending`
(ёслол эхлээгүй).

### Гарын үсэг зурах урсгал

1. Жагсаалт `mine=todo` эсвэл push мэдэгдэл (`kind: "archive"`, `path: /member/archive/{id}?workspace=…`)
   → дэлгэрэнгүй. `document.my_turn && signing_ready` бол «Гарын үсэг зурах».
2. `POST …/sign`. Утсан дээр `callback_url` өгвөл `app_link` нь eID аппыг шууд нээнэ. Санал өгөхтэй
   ижил: зөвхөн тухайн сайтын `https://<host>/auth/eid/callback?return=…` хүлээн авна (native апп
   `AppConfig.eidCallbackURL(returnPath: "/member/archive/{id}")` — universal/App Link). Өгөхгүй бол
   eID утсанд push илгээж, дэлгэц дээр `verification_code`-ийг харуулна.
3. `POST …/sign/poll`-ийг `state` нь `signing`-ээс өөр болтол давтана. 502 = eID холбогдсонгүй эсвэл
   тамгалсан PDF хараахан ирээгүй — хэдэн удаа дахин оролдоод «Дахин оролдох» санал болгоно (ёслол
   30 минут хадгалагдана). 409 `the signature does not cover this document` — өөр зүйл зурсан.
4. `signed` бол дэлгэрэнгүйг дахин ачаална: `signed_count` нэмэгдэж, дараагийн зурагчид мэдэгдэл очно;
   сүүлийнх зурвал `document_status: "signed"`.

Зөвхөн одоогийн зурагч (`current_signer`) зурна; бусад 403 `it is not your turn to sign this document`.

### Аппуудын харгалзуулах алдааны мөрүүд

| Код | `error` | Монгол |
| --- | --- | --- |
| 403 | `it is not your turn to sign this document` | Таны зурах ээлж болоогүй байна |
| 409 | `this document is not out for signature` | Баримт гарын үсэг зуруулахаар илгээгдээгүй |
| 409 | `sign in with eID Mongolia once so you can sign documents` | Нэг удаа eID-ээр нэвтэрнэ үү |
| 409 | `the document changed while the signature was starting; try again` | Дахин оролдоно уу |
| 409 | `the signature does not cover this document` | Гарын үсэг энэ баримтад хамаарахгүй |
| 502 | `eID could not return the signed PDF; try again` | eID тамгалсан PDF-ийг буцаасангүй — дахин оролдоно уу |
| 502 | `eID returned a PDF that is not an added signature on this document` | eID буруу PDF буцаалаа |
| 503 | `eID signing is not available on this installation` | eID гарын үсэг тохируулаагүй |
| 503 | `this installation cannot sign PDF documents` | PDF гарын үсэг боломжгүй |
| 409 | `every signer must be an active member of this branch` | Зурагч бүр салбарын идэвхтэй гишүүн байх ёстой |
| 409 | `choose who signs the document first` | Гарын үсэг зурагч сонгоно уу |
| 409 | `only a draft can be edited` / `only a draft can be sent for signature` | Зөвхөн төслийг |
| 400 | `give a reason for cancelling a document out for signature` | Цуцлах шалтгаан бичнэ үү |
