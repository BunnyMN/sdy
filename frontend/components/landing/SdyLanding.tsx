import Link from "next/link";
import { ArrowDown, ArrowRight, Building2, CalendarDays, CheckCircle2, ChevronRight, Fingerprint, LockKeyhole, QrCode, Smartphone, UserCheck, Wallet } from "lucide-react";
import type { Brand } from "@/lib/brand";
import SdyLandingHeader from "./SdyLandingHeader";
import SdyEventSlides from "./SdyEventSlides";
import SdyFeedback from "./SdyFeedback";
import SdyHashOpen from "./SdyHashOpen";
import styles from "./sdy-landing.module.css";

const features = [
  { icon: CalendarDays, title: "Арга хэмжээнд оролцох", body: "Салбарынхаа арга хэмжээг харж, оролцох хүсэлтээ өгнө. Хэзээ, хаана болохыг нэг дороос мэдээрэй." },
  { icon: CheckCircle2, title: "Ирц, оноогоо харах", body: "Арга хэмжээний QR-аар ирцээ бүртгүүлнэ. Оролцсон түүх, цуглуулсан оноогоо хянаарай." },
  { icon: Wallet, title: "Хураамжаа хянах", body: "Сарын хураамжийн ногдуулалт, төлөлтөө харна. Шилжүүлгээ мэдээлж, баталгаажсан эсэхийг шалгаарай." },
];

/* The preview says what the member area is like to use; the feature cards
   below say what it is for. They used to repeat the same three lines. */
const previewRows = [
  { icon: UserCheck, title: "Гишүүнчлэлийн төлөв", note: "Элсэх, шилжих хүсэлт ба баталгаажуулалт" },
  { icon: QrCode, title: "QR-аар ирц бүртгүүлэх", note: "Арга хэмжээн дээр утсаараа уншуулна" },
  { icon: LockKeyhole, title: "Зөвхөн таны бүртгэл", note: "Та болон эрх бүхий ажилтан л харна" },
];

const questions = [
  { id: "first-sign-in", question: "Анх удаа хэрхэн нэвтрэх вэ?", answer: "eID Mongolia апп-д бүртгэлтэй бол «eID-ээр нэвтрэх» товчийг дарна. Дэлгэц дээрх зааврын дагуу апп дээрээ хүсэлтээ зөвшөөрөөд гишүүний хэсэгт орно. Апп байхгүй бол App Store эсвэл Google Play-ээс «eID Mongolia» гэж хайж суулгана." },
  { id: "join-approval", question: "Салбараа сонгосноор шууд гишүүн болох уу?", answer: "Салбараа сонгож элсэх хүсэлт илгээнэ. Тухайн байгууллагын менежер эсвэл админ баталсны дараа гишүүнчлэл идэвхжинэ." },
  { id: "transfer-approval", question: "Өөр салбар руу шилжиж болох уу?", answer: "Гишүүний хэсгээс шилжих хүсэлт гаргана. Очих байгууллагын админ батлах хүртэл одоогийн харьяалал хэвээр байна. Өмнөх ирц, оноо, төлбөрийн түүх хуучин байгууллагын бүртгэлд хадгалагдана." },
  { id: "dues-payment", question: "Хураамж төлснөө хэрхэн бүртгүүлэх вэ?", answer: "Салбар хураамжийн тохиргоогоо идэвхжүүлсэн үед «Миний хураамж» хэсэгт дүн, данс, төлөх заавар харагдана. Банкны шилжүүлгээ хийж мэдээлсний дараа санхүүгийн эрхтэй ажилтан баталгаажуулна." },
  { id: "data-access", question: "Миний бүртгэлийг хэн харах вэ?", answer: "Та өөрийн ирц, оноо, хураамжийн бүртгэлийг харна. Байгууллагын удирдлага, санхүүгийн ажилтан өөрт олгосон эрхийн хүрээнд тухайн байгууллагын бүртгэлтэй ажиллана." },
];

function SignInLink() {
  return <Link href="/login?next=%2Fmember" className={`${styles.button} ${styles.primary}`}>eID-ээр нэвтрэх <ArrowRight aria-hidden="true" /></Link>;
}

/** SDY's public entry, rendered on the server. The preview contains no member
 * records or invented statistics; it illustrates the available member tools. */
export default function SdyLanding({ brand }: { brand: Brand }) {
  return (
    <div className={styles.page} lang="mn" data-sdy-landing="true">
      <a href="#main-content" className={styles.skip}>Үндсэн агуулга руу очих</a>
      <SdyLandingHeader brand={brand} />
      <main id="main-content" tabIndex={-1}>
        {/* The hero comes first: on a phone the carousel above it pushed the
            heading and the sign-in button below the fold. */}
        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span aria-hidden="true" /> Таны оролцоо эндээс эхэлнэ</p>
            <h1 id="landing-title">Салбартаа нэгдэж,<br />оролцоогоо бүртгэе.</h1>
            <p className={styles.lede}>SDY-ийн гишүүн та салбартаа элсэж, арга хэмжээнд оролцон, ирц, оноо, хураамжаа нэг дороос хянаарай.</p>
            <div className={styles.heroActions}>
              <SignInLink />
              <a className={styles.textLink} href="#how-it-works">Хэрхэн ажилладаг вэ <ArrowDown aria-hidden="true" /></a>
            </div>
            <p className={styles.heroNote}><Fingerprint aria-hidden="true" /> eID Mongolia апп-аар нэвтэрнэ</p>
          </div>
          <figure className={styles.preview}>
            <div className={styles.previewTop}><span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span><span>SDY · Гишүүний хэсэг</span></div>
            <div className={styles.previewBody}>
              <div className={styles.previewIdentity}><span className={styles.previewIcon}><Building2 aria-hidden="true" /></span><span><small>Таны салбар байгууллага</small><strong>Миний гишүүнчлэл</strong></span></div>
              <p className={styles.previewCaption}>Миний үйл ажиллагаа</p>
              <div className={styles.previewRows}>
                {previewRows.map(({ icon: Icon, title, note }) => <div key={title} className={styles.previewRow}>
                  <Icon aria-hidden="true" /><span><strong>{title}</strong><small>{note}</small></span><ChevronRight aria-hidden="true" />
                </div>)}
              </div>
              <div className={styles.previewFoot}><Smartphone aria-hidden="true" /><span>Утас, компьютерээсээ ашиглана</span></div>
            </div>
            <figcaption>Гишүүний хэсгийн тойм зураг</figcaption>
          </figure>
        </section>

        <SdyEventSlides />

        <section id="features" className={`${styles.section} ${styles.features}`} aria-labelledby="features-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading}><p className={styles.eyebrow}>Гишүүний өдөр тутамд</p><h2 id="features-title">Оролцоо бүрээ нэг дороос</h2><p>Салбарынхаа үйл ажиллагаатай холбоотой байж, өөрийн бүртгэлээ хянаарай.</p></div>
            <div className={styles.featureGrid}>{features.map(({ icon: Icon, title, body }) => <article key={title} className={styles.featureCard}>
              <Icon aria-hidden="true" /><h3>{title}</h3><p>{body}</p>
            </article>)}</div>
          </div>
        </section>

        <section id="how-it-works" className={`${styles.container} ${styles.section}`} aria-labelledby="steps-title">
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>Эхлэхэд хялбар</p><h2 id="steps-title">Гурван алхмаар салбартаа нэгдэнэ</h2></div>
          <ol className={styles.steps}>
            {[
              ["eID-ээр нэвтрэх", "eID Mongolia апп дээрээ хүсэлтээ зөвшөөрч, гишүүний хэсэгт нэвтэрнэ."],
              ["Салбараа сонгох", "Өөрийн харьяалах байгууллагыг сонгож, элсэх хүсэлтээ илгээнэ."],
              ["Гишүүнчлэлээ идэвхжүүлэх", "Менежер эсвэл админ хүсэлтийг баталсны дараа салбарын үйл ажиллагаанд оролцоно."],
            ].map(([title, body], index) => <li key={title}><span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></li>)}
          </ol>
          <div className={styles.mobileNote}><Smartphone aria-hidden="true" /><div><h3>Утасныхаа нүүрэнд нэмээд ашиглаарай</h3><p>Нэвтэрсний дараа браузерын «Нүүр дэлгэцэд нэмэх» сонголтоор SDY-г апп шиг нээж болно.</p></div></div>
        </section>

        <section id="questions" className={`${styles.section} ${styles.questions}`} aria-labelledby="questions-title">
          <div className={`${styles.container} ${styles.questionLayout}`}>
            <div className={styles.sectionHeading}><p className={styles.eyebrow}>Танд хэрэгтэй мэдээлэл</p><h2 id="questions-title">Түгээмэл асуулт</h2><p>Элсэлт, шилжилт болон гишүүний бүртгэлийн талаар.</p></div>
            <div className={styles.accordion}>{questions.map(({ id, question, answer }) => <details key={id} id={id}>
              <summary>{question}<ChevronRight aria-hidden="true" /></summary><p>{answer}</p>
            </details>)}</div>
          </div>
        </section>

        <SdyFeedback />

        <section className={`${styles.container} ${styles.finalCta}`} aria-labelledby="start-title">
          <div><p className={styles.eyebrow}>SDY · Гишүүний цахим систем</p><h2 id="start-title">Салбарынхаа үйл ажиллагаанд нэгдээрэй</h2><p>Гишүүнчлэл, оролцоо, хувийн бүртгэл — нэг дор.</p></div><SignInLink />
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerMain}><span>{brand.name}</span>
            <nav aria-label="Хуудасны холбоос"><a href="#how-it-works">Элсэх заавар</a><a href="#data-access">Мэдээлэл ба эрх</a><a href="#questions">Түгээмэл асуулт</a><a href="#feedback">Санал хүсэлт</a></nav>
            <nav aria-label="Тусламж ба бодлого"><Link href="/support">Тусламж</Link><Link href="/privacy">Нууцлалын бодлого</Link><Link href="/support#contact">Холбоо барих</Link></nav>
          </div>
          <div className={styles.footerBottom}><span>© {new Date().getFullYear()} {brand.shortName}</span><span>Gerege технологид суурилав</span></div>
        </div>
      </footer>
      <SdyHashOpen />
    </div>
  );
}
