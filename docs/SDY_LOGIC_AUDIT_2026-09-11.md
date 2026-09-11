# SDY логик аудит ба дараагийн үйлдлүүд — 2026-09-11

## Одоогийн кодын дүгнэлт

Шилжилт/элсэлтийн гол хамгаалалт зөв байна.

- Гишүүн өөрөө шилжилтийн хүсэлт гаргана; очих байгууллагын идэвхтэй admin
  л шийднэ. Manager зөвхөн ердийн элсэлтийг шийднэ.
- Хүсэлт хүлээгдэж байх үед эх үүсвэрийн гишүүнчлэл идэвхтэй үлдэнэ.
  Баталсны дараа эх үүсвэр хаагдаж, очих байгууллагад зөвхөн `user` эрх олгоно.
- Шилжилт нь ирц, оноо, төлбөрийн түүхийг зөөхгүй/устгахгүй. Хуучин session
  хүчингүй болж, давхар хүсэлт, зэрэгцсэн accept/cancel, сүүлчийн admin
  хамгаалагдсан.
- `membership_branch` байгууллагад хуучин join request-ээр тойрч орох замыг
  хаасан. RLS болон SECURITY DEFINER үйлдлүүдийн шууд SQL bypass-ийг тестэлсэн.
- `from_tenant_id`-г хэрэглэгч дур мэдэн сонгосон ч сервер тухайн эх үүсвэрийн
  идэвхтэй гишүүнчлэлээр дахин шалгадаг; destination slug нь идэвхтэй branch,
  suspended/deletion-scheduled биш байгууллага байх ёстой.
- Демо manager-д admin/finance/өөр байгууллагын эрх олгоогүй. Одоогийн
  production өгөгдөл түр тест цэвэрлэсний дараа users=3, events=1,
  dues charges=0, transfers=0 хэвээр.

Backend-ийн тусгаарласан PostgreSQL+Redis бүрэн suite: 799 тест, 61 package,
0 skip; frontend 198 unit, 23 existing browser, 12 landing browser тест PASS.
Одоогийн machine дээр `go test ./...`-ийн зарим `httptest.NewServer` тестүүд
IPv6 listener-ийг sandbox хориглосноос panic болсон нь кодын assert failure биш
орчны хязгаарлалт. Production image/backend health болон бодит шилжилтийн
smoke PASS.

## Логикт анхаарч шалгасан үлдсэн эрсдэл

Эдгээр нь одоогоор эвдэрсэн гэж тогтоогоогүй, дараагийн acceptance test-д заавал
батлах зүйлс юм.

1. Нэг хүн нэгэн зэрэг хэд хэдэн branch хүсэлт гаргах үед зөвхөн нэг pending
   хүсэлт үлдэх, өөр destination руу шинэ хүсэлт өмнөхийг далдлахгүй байх.
2. Destination admin өөрөө шилжих хүсэлт гаргасан үед өөр admin шийдэх хүртэл
   хэвээр үлдэх; өөрийгөө батлах зам үүсэхгүй байх.
3. Байгууллага suspended/deletion scheduled болох мөчид pending хүсэлт шийдэх
   оролдлого 409/404 болж, source membership санамсаргүй хаагдахгүй байх.
4. Нэр/email өөрчлөгдсөн, идэвхгүй болсон, дахин бүртгүүлсэн хэрэглэгчийн
   audit ба түүх зөв user UUID дээр үлдэх.
5. Event бүртгэл capacity зэрэгцээ дүүрэх, QR хугацаа дуусах, давхар check-in,
   attendance засварын audit ба оноо давхардахгүй байх.
6. Dues period дахин charge хийхэд idempotent байх; төлөлт reject/reverse/waive
   хийсний дараа үлдэгдэл, audit, түүх хоорондоо таарах.
7. Хувийн мэдээлэл export/delete хүсэлт, session/device revoke, email/eID
   холбоос салгах үед RLS болон audit нэг ижил бодлоготой байх.

## Ижил төрлийн системээс гарсан нэмэлт үйлдлүүд

Дараахуудыг одоо байгаа `members → events → attendance/points → dues` суурийн
дээр үе шаттай нэмэх нь тохиромжтой.

### P0 — өдөр тутмын ажиллагаанд шууд хэрэгтэй

- Гишүүний профайл: зураг, утас, оршин суух аймаг/сум, онцгой холбоо барих
  хүн, зөвшөөрлийн төлөв; хэрэглэгч өөрөө засах, admin баталгаажуулах.
- Гишүүнчлэлийн lifecycle: pending/active/suspended/expired/alumni,
  элссэн/шинэчилсэн огноо, хугацаа дуусах сануулга, bulk import/export.
- Мэдэгдэл: элсэлт/шилжилт/ирц/төлөлт/арга хэмжээний reminder; in-app эхэлж,
  дараа нь email/SMS provider. Notification preferences, unsubscribe, audit.
- Event-ийн бүрэн урсгал: recurring event, waitlist, reminder, RSVP хаах,
  оролцооны тайлан, attendance correction reason.
- Салбарын dashboard: active members, pending applications/transfers,
  attendance rate, dues paid/outstanding, сар бүрийн snapshot.

### P1 — байгууллагын удирдлага ба оролцоо

- Салбар, хороо, ажлын хэсэг, албан тушаалын шатлал; manager, finance,
  events, communications гэсэн нарийн role/permission.
- Announcement/newsfeed: салбар эсвэл бүх гишүүнд нийтлэх, уншсан төлөв,
  хавсралт, хугацаатай нийтлэл.
- Сургалт/чадавхжуулалт: курс, материал, бүртгэл, quiz/сертификат,
  оноонд холбох; залуу гишүүний хөгжлийн замнал.
- Хурлын бүртгэл: agenda, minutes, шийдвэр, action item, хариуцагч,
  deadline, биелэлтийн төлөв.
- Сайн дурын ажил/кампанит ажил: shift, task, цагийн бүртгэл, оноо,
  оролцооны leaderboard-ийг зөвшөөрөлтэйгээр харуулах.

### P2 — дотоод ардчилал, ил тод байдал, хамгаалалт

- Дотоод санал асуулга/сонгууль: eligibility snapshot, нэр дэвшигч,
  нууц санал, нэг хүн-нэг санал, дахин санал өгөх хамгаалалт, үр дүнгийн audit.
- Хандив/төсөл/кампанийн төсөв: орлого-зарлага, төсөв батлах workflow,
  салбар хоорондын хуваарилалт, export.
- Баримтын сан: дүрэм, хурлын тэмдэглэл, бодлого, гарын үсэгтэй зөвшөөрөл,
  хувилбар/retention/access log.
- Залуучуудын хамгаалалт: consent, emergency contact, incident log,
  зөвхөн тусгай эрхтэй ажилтан харах; насанд хүрээгүй гишүүний guardian
  урсгалыг тусад нь шийдэх.
- Нууцлал ба өгөгдлийн эрх: data access/export, correction, deletion request,
  retention schedule, бүх admin үйлдлийн audit viewer.

## Хэрэгжүүлэх санал болгосон дараалал

1. P0 lifecycle + notification + event reminder/dashboard.
2. P1 branch/committee roles + announcement + meeting/task.
3. P2 voting/election, document governance, safeguarding, finance expansion.

Сарын хураамжийн бодит дүн, банкны данс, төлөх өдөр, насны/guardian дүрэм,
сонгуулийн дүрэм, мэдээлэл хадгалах хугацааг байгууллагын журмаар баталсны
дараа тохиргоонд оруулна. Дур мэдэн production-д мөнгөн дүн эсвэл eligibility
дүрэм тохируулахгүй.

## Судалгааны эх сурвалж

- [JCW Platform — national/local organisation, members, events, dues, voting strength](https://www.jcwplatform.com/)
- [Youthy — sessions, member records, safeguarding, policies, impact](https://youthyapp.com/)
- [Orgo — chapters, renewals, events, dues, documents, eVoting](https://orgo.space/)
- [verein.xhub — member master data, dues, AGM attendance/voting, newsletter, data export](https://verein.xhub.io/en)
- [Quorify — members, meetings, attendance, voting, recruitment, dues, projects and reports](https://www.usequorify.com/en)
- [NDI Best Practices of Effective Parties](https://www.ndi.org/files/Best_Practices_of_Effective_Parties_English.pdf)
- [Council of Europe — code of good practice for political parties](https://assembly.coe.int/Documents/WorkingDocs/2007/EDOC11210.pdf)

