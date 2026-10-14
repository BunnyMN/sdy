"use client";

import { useCallback, useEffect, useState } from "react";
import { Bug, CheckCircle2, Lightbulb, MessageCircle, Send, Sparkles } from "lucide-react";
import { apiBase } from "@/lib/apiBase";
import styles from "./sdy-landing.module.css";

type Category = "idea" | "request" | "bug" | "other";

const categories: { value: Category; label: string; icon: typeof Lightbulb }[] = [
  { value: "idea", label: "Санал", icon: Lightbulb },
  { value: "request", label: "Хүсэлт", icon: Sparkles },
  { value: "bug", label: "Алдаа", icon: Bug },
  { value: "other", label: "Бусад", icon: MessageCircle },
];

const MAX_MESSAGE = 2000;
const PAGE = 12;

type Status = "new" | "seen" | "planned" | "done";
type Item = { id: string; category: Category; message: string; name: string; status: Status; created_at: string };

const statusLabel: Record<Status, string> = { new: "Шинэ", seen: "Үзсэн", planned: "Төлөвлөсөн", done: "Хийгдсэн" };
const categoryLabel = Object.fromEntries(categories.map(({ value, label }) => [value, label])) as Record<Category, string>;

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

/** The open suggestion box on SDY's front page. Nobody has to sign in: the
 * pilot wants to hear from the people who have not got that far as well.
 * During the pilot the list is open too — everybody sees what was said, and
 * where the team has got with it. Contact details are never shown. */
export default function SdyFeedback() {
  const [category, setCategory] = useState<Category>("idea");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [failure, setFailure] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [listState, setListState] = useState<"loading" | "ready" | "failed">("loading");

  const loadPage = useCallback(async (offset: number) => {
    try {
      const response = await fetch(`${apiBase()}/feedback?limit=${PAGE}&offset=${offset}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      // An answer of the wrong shape is an empty list, never a broken page.
      const body = await response.json().catch(() => null) as { feedback?: unknown; total?: unknown } | null;
      const page = Array.isArray(body?.feedback) ? body.feedback as Item[] : [];
      setItems(current => offset === 0 ? page : [...current, ...page.filter(item => !current.some(c => c.id === item.id))]);
      setTotal(typeof body?.total === "number" ? body.total : page.length);
      setListState("ready");
    } catch {
      setListState(current => current === "ready" ? "ready" : "failed");
    }
  }, []);

  useEffect(() => { void loadPage(0); }, [loadPage]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length < 5) {
      setFailure("Саналаа арай дэлгэрэнгүй бичнэ үү.");
      return;
    }
    setState("sending");
    setFailure("");
    try {
      const response = await fetch(`${apiBase()}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ category, message, name, contact, website, page: window.location.pathname }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
        throw new Error(response.status === 429
          ? "Хэт олон удаа илгээлээ. Түр хүлээгээд дахин оролдоно уу."
          : body?.error || body?.message || "Илгээж чадсангүй. Дахин оролдоно уу.");
      }
      setState("sent");
      setMessage("");
      void loadPage(0);
    } catch (error) {
      setState("idle");
      setFailure(error instanceof Error ? error.message : "Илгээж чадсангүй. Дахин оролдоно уу.");
    }
  }

  return (
    <section id="feedback" className={`${styles.container} ${styles.section}`} aria-labelledby="feedback-title">
      <div className={styles.feedbackLayout}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}><span aria-hidden="true" /> Туршилтын үе</p>
          <h2 id="feedback-title">Санал хүсэлтээ хэлээрэй</h2>
          <p>SDY систем одоо туршилтын шатандаа явж байна. Юу таалагдсан, юу дутуу байна, ямар боломж нэмэгдээсэй гэж хүсэж байгаагаа бидэнд нээлттэй хэлээрэй. Нэвтрэх шаардлагагүй.</p>
          <ul className={styles.feedbackNotes}>
            <li><CheckCircle2 aria-hidden="true" /> Санал бүрийг багийнхан уншиж, хөгжүүлэлтдээ тусгана</li>
            <li><CheckCircle2 aria-hidden="true" /> Ирсэн саналууд доор бүх хүнд нээлттэй харагдана</li>
            <li><CheckCircle2 aria-hidden="true" /> Нэр заавал биш; утас, и-мэйл тань нийтэд харагдахгүй</li>
          </ul>
        </div>

        {state === "sent" ? (
          <div className={styles.feedbackCard} role="status">
            <div className={styles.feedbackDone}>
              <CheckCircle2 aria-hidden="true" />
              <h3>Баярлалаа!</h3>
              <p>Таны санал хүлээн авагдаж, доорх жагсаалтад нэмэгдлээ. Систем сайжрахад таны оролцоо чухал.</p>
              <button type="button" className={styles.button} onClick={() => setState("idle")}>Өөр санал илгээх</button>
            </div>
          </div>
        ) : (
          <form className={styles.feedbackCard} onSubmit={submit} noValidate>
            <fieldset className={styles.feedbackKinds}>
              <legend>Төрөл</legend>
              {categories.map(({ value, label, icon: Icon }) => (
                <label key={value} data-active={category === value || undefined}>
                  <input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} />
                  <Icon aria-hidden="true" /> {label}
                </label>
              ))}
            </fieldset>

            <label className={styles.feedbackField}>
              <span>Таны санал <em aria-hidden="true">*</em></span>
              <textarea required rows={5} maxLength={MAX_MESSAGE} value={message} onChange={event => setMessage(event.target.value)}
                placeholder="Жишээ нь: Арга хэмжээний мэдэгдэл утсанд ирдэг болвол сайн байна…" />
              <small>{message.length}/{MAX_MESSAGE}</small>
            </label>

            <div className={styles.feedbackRow}>
              <label className={styles.feedbackField}>
                <span>Нэр <small>(заавал биш, нийтэд харагдана)</small></span>
                <input value={name} maxLength={100} autoComplete="name" onChange={event => setName(event.target.value)} />
              </label>
              <label className={styles.feedbackField}>
                <span>Утас эсвэл и-мэйл <small>(заавал биш, зөвхөн багт)</small></span>
                <input value={contact} maxLength={120} autoComplete="email" onChange={event => setContact(event.target.value)} />
              </label>
            </div>

            {/* Hidden from people; a script that fills every field fills this one too. */}
            <label className={styles.feedbackTrap} aria-hidden="true">
              Website <input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
            </label>

            {failure && <p className={styles.feedbackError} role="alert">{failure}</p>}

            <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={state === "sending"}>
              {state === "sending" ? "Илгээж байна…" : "Санал илгээх"} <Send aria-hidden="true" />
            </button>
          </form>
        )}
      </div>

      <div className={styles.feedbackWall} aria-labelledby="feedback-wall-title">
        <h3 id="feedback-wall-title">Ирсэн санал хүсэлт{listState === "ready" && <span> · {total}</span>}</h3>
        {listState === "loading" && <p className={styles.feedbackEmpty}>Ачааллаж байна…</p>}
        {listState === "failed" && <p className={styles.feedbackEmpty}>Саналуудыг ачаалж чадсангүй. <button type="button" onClick={() => { setListState("loading"); void loadPage(0); }}>Дахин оролдох</button></p>}
        {listState === "ready" && items.length === 0 && <p className={styles.feedbackEmpty}>Одоогоор санал ирээгүй байна. Эхний саналыг та өгөөрэй!</p>}
        {items.length > 0 && <ul className={styles.feedbackList}>
          {items.map(item => <li key={item.id} className={styles.feedbackItem}>
            <div className={styles.feedbackMeta}>
              <span className={styles.feedbackTag}>{categoryLabel[item.category] ?? "Бусад"}</span>
              <span className={styles.feedbackStatus} data-status={item.status}>{statusLabel[item.status] ?? item.status}</span>
            </div>
            <p>{item.message}</p>
            <small>{item.name || "Нэргүй"} · <time dateTime={item.created_at}>{formatDate(item.created_at)}</time></small>
          </li>)}
        </ul>}
        {listState === "ready" && items.length < total && <button type="button" className={styles.button} onClick={() => void loadPage(items.length)}>Цааш үзэх</button>}
      </div>
    </section>
  );
}
