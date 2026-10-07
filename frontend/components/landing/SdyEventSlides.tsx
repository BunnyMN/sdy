"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pause, Play, Users } from "lucide-react";
import styles from "./sdy-landing.module.css";

type Slide = {
  id: string;
  image: string;
  width: number;
  height: number;
  title: string;
  kicker: string;
  when: string;
  where: string;
  who?: string;
  body: string;
};

/* The union's own posters, in public/sdy/events/. The details are what each
   poster says and nothing more: a date the poster does not give is not
   written here either. */
const slides: Slide[] = [
  {
    id: "sdy-festival-2026", image: "/sdy/events/sdy-festival-2026.webp", width: 1600, height: 900,
    kicker: "Наадам", title: "SDY Festival 2026",
    when: "2026 он", where: "Дархан хот",
    body: "Дархан-Уулын залуучуудыг нэг талбарт цуглуулдаг SDY-ийн жил бүрийн наадам.",
  },
  {
    id: "moddoo-usalya-2026", image: "/sdy/events/moddoo-usalya-2026.webp", width: 1024, height: 1536,
    kicker: "Ногоон аян", title: "Моддоо усалъя — хаврын цэнэг усалгааны аян",
    when: "2026.05.16, 10:00", where: "Дархан, Орхон, Шарын гол, Хонгор сумдад нэгэн зэрэг",
    who: "Санаачлагч: Дархан-Уул аймгийн SDY · Тэрбум мод үндэсний хөдөлгөөн",
    body: "Дархан хотын цэвэрлэх байгууламжаас гарсан 95% цэвэршүүлсэн усыг хотын ногоон байгууламжийн усалгаанд ашиглах аян. Аж ахуйн нэгж, төрийн байгууллага, оюутан сурагчид, залуучууд, бүх нийт оролцоно.",
  },
  {
    id: "nairamdal-moto-festival-2026", image: "/sdy/events/nairamdal-moto-festival-2026.webp", width: 1600, height: 994,
    kicker: "Фестиваль", title: "Азна базна — Найрамдал Moto Festival",
    when: "2026.05.02", where: "Найрамдал талбай, Дархан",
    who: "Ерөнхий зохион байгуулагчдын нэг: SDY Darkhan",
    body: "Мотоцикл, авто спортын сонирхогчдыг нэгтгэсэн Дарханы задгай фестиваль.",
  },
  {
    id: "sd-walking-festival-2026", image: "/sdy/events/sd-walking-festival-2026.webp", width: 1080, height: 1080,
    kicker: "Аялал", title: "SD Walking Festival — Go walk, feel free!",
    when: "2026.04.12, 07:00", where: "Дархан Хайрхан · Залуучуудын театрын урдаас хөдөлнө",
    who: "SDS · SDY · SDW хамтран · Хураамж 10,000₮",
    body: "Бусдыгаа хүндэтгэн цагтаа ирж, цаг агаартаа тохирсон хувцас, халуун ус, хөнгөн хүнсээ бэлдээд хамтдаа уул өөд алхана.",
  },
  {
    id: "silver-rose-2025", image: "/sdy/events/silver-rose-2025.webp", width: 1500, height: 659,
    kicker: "Хүндэтгэлийн үдэш", title: "SDY Mode On — Silver Rose",
    when: "2025.12.30, 17:00", where: "Grand Yak Event Hall, Дархан",
    body: "Celebrate Excellence — оны турш идэвх гаргасан гишүүдээ тодруулж, хамтдаа он гаргасан үдэш.",
  },
];

const INTERVAL = 7000;

/**
 * The union's events above the fold. A scroll-snap track, so it swipes and
 * scrolls with no JavaScript at all; the script adds the arrows, the dots and
 * the slow advance, which stops for a hover, a focus, a hidden tab, a pause
 * press or a reduced-motion preference.
 */
export default function SdyEventSlides() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [still, setStill] = useState(false);

  const go = useCallback((next: number) => {
    const el = track.current;
    if (!el) return;
    const target = (next + slides.length) % slides.length;
    el.scrollTo({ left: target * el.clientWidth, behavior: still ? "auto" : "smooth" });
  }, [still]);

  useEffect(() => {
    setReady(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    if (!ready || paused || held || still) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") go(index + 1); }, INTERVAL);
    return () => window.clearInterval(timer);
  }, [ready, paused, held, still, index, go]);

  return (
    <section className={`${styles.container} ${styles.events}`} aria-roledescription="carousel" aria-labelledby="events-title"
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}
      onKeyDown={event => {
        if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
      }}>
      <div className={styles.eventsHead}>
        <div>
          <p className={styles.eyebrow}><span aria-hidden="true" /> Салбарын арга хэмжээ</p>
          <h2 id="events-title">Бидний хамтдаа бүтээсэн мөчүүд</h2>
        </div>
        {ready && <div className={styles.eventsControls}>
          <button type="button" className={styles.iconButton} onClick={() => setPaused(value => !value)}
            aria-label={paused ? "Автоматаар солихыг үргэлжлүүлэх" : "Автоматаар солихыг зогсоох"}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
          <button type="button" className={styles.iconButton} onClick={() => go(index - 1)} aria-label="Өмнөх арга хэмжээ"><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className={styles.iconButton} onClick={() => go(index + 1)} aria-label="Дараагийн арга хэмжээ"><ChevronRight aria-hidden="true" /></button>
        </div>}
      </div>

      <div ref={track} className={styles.eventsTrack} aria-live={paused || held ? "polite" : "off"}>
        {slides.map((slide, i) => (
          <article key={slide.id} className={styles.eventSlide} aria-roledescription="slide"
            aria-label={`${i + 1} / ${slides.length}: ${slide.title}`} aria-hidden={ready && i !== index ? true : undefined}>
            <div className={styles.eventPoster}>
              {/* The same poster, blurred, fills the frame behind posters of every shape. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.eventBackdrop} src={slide.image} alt="" aria-hidden="true" loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.eventImage} src={slide.image} width={slide.width} height={slide.height}
                alt={`${slide.title} — зурагт хуудас`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
            </div>
            <div className={styles.eventDetails}>
              <p className={styles.eventKicker}>{slide.kicker}</p>
              <h3>{slide.title}</h3>
              <ul>
                <li><CalendarDays aria-hidden="true" /><span>{slide.when}</span></li>
                <li><MapPin aria-hidden="true" /><span>{slide.where}</span></li>
                {slide.who && <li><Users aria-hidden="true" /><span>{slide.who}</span></li>}
              </ul>
              <p className={styles.eventBody}>{slide.body}</p>
            </div>
          </article>
        ))}
      </div>

      {ready && <div className={styles.eventDots} role="group" aria-label="Арга хэмжээ сонгох">
        {slides.map((slide, i) => (
          <button key={slide.id} type="button" onClick={() => go(i)} aria-label={`${i + 1}: ${slide.title}`}
            aria-current={i === index ? "true" : undefined}><span /></button>
        ))}
      </div>}
    </section>
  );
}
