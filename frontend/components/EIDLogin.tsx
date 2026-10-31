"use client";

import {useCallback,useEffect,useId,useRef,useState} from "react";
import dynamic from "next/dynamic";
import {api} from "@/lib/api";
import {useI18n} from "@/lib/i18n";
import {useErrorMessage} from "@/lib/useErrorMessage";
import {ExternalLink,Fingerprint,HelpCircle,RefreshCw,ShieldCheck,Smartphone,X} from "lucide-react";
import {safeReturnPath} from "@/lib/safeReturnPath.mjs";
import {EID_NEXT_KEY} from "@/lib/signIn";

// Fetched when a QR code is actually drawn, which is after the visitor has
// chosen to sign in with their phone. Imported at the top it was 15 KB over the
// wire on the landing page — this component is in the hero (components/landing/
// Hero.tsx), so every visitor paid for a picture almost none of them ask for.
const QRCodeSVG = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), {
  ssr: false,
});

type Method="id"|"qr";
type Phase="idle"|"starting"|"waiting"|"expired"|"refused"|"error"|"success";
// expires_at is absent for push sessions: eID reports no deadline for them, and
// the API no longer invents one.
type Start={session_id:string;device_link_url?:string;qr_links?:string[];app_link?:string;verification_code:string;expires_at?:string};
// eID's v3 QR link names the seconds since the session began and is good for
// about twenty, so the code on screen changes every second. The API sends a
// minute of links at a time (entry i is for i seconds after they arrived) and
// is asked for the next minute this many seconds before they run out.
const QR_REFILL_AHEAD=15;

// The API holds every /auth/eid/poll open for up to 25s and answers the moment
// the citizen approves, so this gap is the only stretch where an approval is
// not being watched. Keep it short: at 25s per check it costs almost nothing in
// requests, and it is pure delay between approving and being signed in.
const GAP=400;
// A dropped long-poll is ordinary on a mobile network, so a session survives
// a few in a row before the citizen is told the sign-in failed.
const TOLERATED_FAILURES=3;
// Backstop, not a deadline. eID decides when a session dies and says so with
// EXPIRED; this only stops the card polling forever if that answer never comes,
// so it sits well beyond any real session — one was still RUNNING after nine
// minutes. A tighter figure here abandons approvals that were still in progress.
const BACKSTOP=15*60_000;

// Where somebody without the eID Mongolia app gets it. Store searches rather
// than listings, the same as the iOS member app (native-apps/sdy-ios Config.swift):
// TODO: replace with the official App Store / Google Play listing URLs once the
// eID Mongolia publisher confirms them.
export const EID_APP_STORE_URL="https://apps.apple.com/mn/search?term=eID%20Mongolia";
export const EID_PLAY_STORE_URL="https://play.google.com/store/search?q=eID%20Mongolia&c=apps";

// A registration number is two Cyrillic letters and eight digits. People type
// it on a Latin keyboard as often as not, so Latin letters that look like a
// Cyrillic one are read as that letter — "AA" and "АА" are the same thing on
// screen and should be the same thing to eID.
const LOOKALIKE:Record<string,string>={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х",Y:"У"};
export function normaliseNationalId(raw:string){return raw.toUpperCase().replace(/[A-Z]/g,c=>LOOKALIKE[c]??c).replace(/\s+/g,"")}
// Register number, or a civil-registration number (digits only).
export function validNationalId(value:string){return /^[А-ЯЁӨҮ]{2}\d{8}$/.test(value)||/^\d{8,}$/.test(value)}

function mobile(){return typeof navigator!=="undefined"&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)}
// Аль browser-ээс эхэлснийг eID апп руу дамжуулна — approve хийсний дараа ЯГ ТЭР browser руу
// буцна. Үгүй бол апп системийн default browser-ыг нээж (iOS дээр ихэвчлэн Safari), иргэн
// нэвтэрч эхэлсэн цонхоо алддаг. iOS: browser-ийн scheme/token; Android: package. Танихгүй
// browser (ж Brave — UA нь ялгарахгүй) → hint байхгүй → default. Зөвшөөрөх жагсаалт апп талд.
const IOS_BROWSERS:Array<[RegExp,string]>=[[/CriOS/i,"googlechromes"],[/EdgiOS/i,"microsoft-edge-https"],[/FxiOS/i,"firefox"],[/Focus\//i,"firefox-focus"],[/OPT\//i,"touch-https"],[/OPiOS|OPR\//i,"opera-https"],[/DuckDuckGo/i,"ddgQuickLink"],[/YaBrowser|YaSearchBrowser/i,"yandexbrowser-open-url"]]
// "Chrome/" хамгийн сүүлд: Chromium суурьтай бүх browser (Edge, Opera, Samsung, Yandex…) UA-даа
// түүнийг агуулдаг тул эхэнд шалгавал бүгд Chrome болж таарна.
const ANDROID_BROWSERS:Array<[RegExp,string]>=[[/EdgA\//i,"com.microsoft.emmx"],[/OPR\//i,"com.opera.browser"],[/Opera Mini/i,"com.opera.mini.native"],[/SamsungBrowser\//i,"com.sec.android.app.sbrowser"],[/YaBrowser\//i,"com.yandex.browser"],[/DuckDuckGo\//i,"com.duckduckgo.mobile.android"],[/Vivaldi\//i,"com.vivaldi.browser"],[/Whale\//i,"com.naver.whale"],[/UCBrowser\//i,"com.UCMobile.intl"],[/Focus\//i,"org.mozilla.focus"],[/Firefox\//i,"org.mozilla.firefox"],[/Chrome\//i,"com.android.chrome"]]
export function browserHint(ua:string){const table=/iPhone|iPad|iPod/i.test(ua)?IOS_BROWSERS:/Android/i.test(ua)?ANDROID_BROWSERS:[];const hit=table.find(([re])=>re.test(ua));return hit?`?${table===IOS_BROWSERS?"retScheme":"retPkg"}=${encodeURIComponent(hit[1])}`:""}
function callbackURL(){return typeof window==="undefined"?"":`${window.location.origin}/auth/eid/callback${browserHint(navigator.userAgent)}`}
function deadlineOf(start:Start){const at=Date.parse(start.expires_at??"");return Number.isNaN(at)?Date.now()+BACKSTOP:at}
function hasDeadline(start:Start){return !Number.isNaN(Date.parse(start.expires_at??""))}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function clock(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`}

/**
 * `variant="signin"` нь картын чимэглэлээ орхино — толгой ба хөл нь эргэн тойрны
 * signin-card дээр аль хэдийн байгаа тул давхарлах нь утгагүй. Логик нь адилхан:
 * зөвхөн юу зурагдах нь өөр.
 */
/**
 * `link` нь гурав дахь горим.
 *
 * Нэвтрэх (`binding` хоосон), парклагдсан таних тэмдгийг батлах (`binding`),
 * ба **аль хэдийн нэвтэрсэн данс дээрээ eID нэмэх** (`link`). Гуравт нь
 * эхлүүлэх алхам нь ижил — eID-ийн session эхлүүлэх нь юу ч нотлохгүй —
 * зөвхөн дуусгах нь өөр: хариу нь session-ий эзэнд бичигдэнэ, шинэ session
 * нээхгүй. Тиймээс энд ялгаа нь ганц мөр, нэг бүрэн component биш.
 */
export default function EIDLogin({next="/member",compact=false,variant="card",binding,link=false,onLinked}:{next?:string;compact?:boolean;variant?:"card"|"signin";binding?:string;link?:boolean;onLinked?:()=>void}){
  const {t}=useI18n();
  const errorMessage=useErrorMessage();
  const uid=useId();
  const returnTo=safeReturnPath(next,"/member");
  // Read after mount: the server cannot know, and guessing differently from the
  // browser is a hydration mismatch.
  const [onPhone,setOnPhone]=useState(false);
  useEffect(()=>{setOnPhone(mobile())},[]);
  const [invalid,setInvalid]=useState(false);
  // What a screen reader is told about the countdown: twice, not every second.
  const [announce,setAnnounce]=useState("");
  const announced=useRef(0);
  const [method,setMethod]=useState<Method>("id"),[phase,setPhase]=useState<Phase>("idle"),[nationalId,setNationalId]=useState(""),[start,setStart]=useState<Start|null>(null),[error,setError]=useState(""),[left,setLeft]=useState(0);
  // Each attempt takes a ticket. Anything asynchronous compares its ticket
  // before touching state, so a cancelled or superseded attempt cannot revive
  // the card once the citizen has moved on.
  const ticket=useRef(0),inflight=useRef<AbortController|null>(null);
  const stop=useCallback(()=>{ticket.current++;inflight.current?.abort();inflight.current=null},[]);

  /* One check at a time. Polling on an interval instead stacked long-polls —
     ten of them within the first 25s — until the browser ran out of
     connections to the host and the page stopped responding altogether. */
  const watch=useCallback(async(data:Start)=>{
    stop();
    const mine=ticket.current,deadline=deadlineOf(data);
    let failures=0;
    setStart(data);setPhase("waiting");
    while(ticket.current===mine){
      if(Date.now()>=deadline){setPhase("expired");return}
      const control=new AbortController();
      inflight.current=control;
      try{
        const res=link?await api.linkEID(data.session_id,control.signal):binding?await api.bindingEIDPoll(binding,data.session_id,control.signal):await api.pollEID(data.session_id,control.signal);
        if(ticket.current!==mine)return;
        failures=0;
        // Холбох горимд хуудас солигдохгүй: хүн профайл дээрээ байсаар,
        // жагсаалт нь шинэчлэгдэнэ. Нэвтрэх горимд эсрэгээрээ — session
        // үүссэн тул тэр хүн хаа нэгтээ очих ёстой.
        if(res.state==="COMPLETE"){ticket.current++;setPhase("success");if(link)onLinked?.();else window.location.assign(returnTo);return}
        if(res.state==="EXPIRED"){setPhase("expired");return}
        if(res.state==="REFUSED"){setPhase("refused");return}
      }catch(e:any){
        if(ticket.current!==mine)return;
        if(++failures>TOLERATED_FAILURES){setError(errorMessage(e,{fallback:"auth.message.error_link"}));setPhase("error");return}
      }
      await sleep(GAP);
    }
  },[binding,link,onLinked,returnTo,stop,errorMessage]);

  const begin=useCallback(async(selected:Method)=>{
    stop();
    const mine=ticket.current;
    setError("");setStart(null);setPhase("starting");
    try{
      const cb=mobile()?callbackURL():"";
      if(cb&&!link&&!binding){try{sessionStorage.setItem(EID_NEXT_KEY,returnTo)}catch{/* Storage may be disabled; the callback falls back to /member. */}}
      const data:Start=binding
        ?await api.bindingEIDStart(binding,selected==="qr"?undefined:nationalId.trim().toUpperCase())
        :(selected==="qr"?await api.startEID(cb):await api.startEIDByNationalID(nationalId.trim().toUpperCase(),cb));
      if(ticket.current!==mine)return;
      // Same phone: eID's v3 Web2App link opens the app and brings the citizen
      // back to /auth/eid/callback. It is a button now rather than an automatic
      // jump: a phone without the app took the jump to a dead end, with no way
      // to learn why. The old geregesmartid:// scheme is no longer read.
      void watch(data);
    }catch(e:unknown){
      if(ticket.current!==mine)return;
      setError(errorMessage(e,{fallback:"auth.message.error_service"}));setPhase("error");
    }
  },[binding,link,nationalId,returnTo,stop,errorMessage,watch]);

  /* Runs down the backstop, and shows it only when eID actually gave a deadline
     to run down. A countdown the API made up is worse than none: it hurried the
     citizen and then cut the session off while eID was still waiting on them. */
  useEffect(()=>{
    if(phase!=="waiting"||!start)return;
    const deadline=deadlineOf(start);
    announced.current=0;
    const tick=()=>{const secs=Math.max(0,Math.ceil((deadline-Date.now())/1000));setLeft(secs);if(secs===0){stop();setPhase("expired");return}
      if(!hasDeadline(start))return;
      const mark=secs<=10?10:secs<=60?60:0;
      if(mark&&announced.current!==mark){announced.current=mark;setAnnounce(t("auth.message.expires_soon",{time:clock(secs)}))}};
    tick();
    const id=setInterval(tick,1000);
    return ()=>clearInterval(id);
  },[phase,start,stop,t]);

  /* Turns the QR over every second, from the links the API already sent, and
     asks for the next minute before they run out. A refill that fails leaves
     the last link up; the poll decides when the session is over. */
  const [qrLink,setQrLink]=useState("");
  useEffect(()=>{
    if(phase!=="waiting"||method!=="qr"||!start){setQrLink("");return}
    let links=start.qr_links?.length?start.qr_links:start.device_link_url?[start.device_link_url]:[];
    let since=Date.now(),refilling=false,retryAt=0,live=true;
    const tick=()=>{
      const index=Math.floor((Date.now()-since)/1000);
      setQrLink(links[Math.min(index,links.length-1)]??"");
      if(!refilling&&links.length>1&&index>=links.length-QR_REFILL_AHEAD&&Date.now()>=retryAt){
        refilling=true;
        api.eidQR(start.session_id).then(res=>{if(live&&res.qr_links?.length){links=res.qr_links;since=Date.now();tick()}}).catch(()=>{retryAt=Date.now()+5000}).finally(()=>{refilling=false});
      }
    };
    tick();
    const id=setInterval(tick,1000);
    return ()=>{live=false;clearInterval(id)};
  },[phase,method,start]);

  useEffect(()=>()=>{stop()},[stop]);
  const cancel=()=>{stop();setPhase("idle");setStart(null);setError("");setAnnounce("")};
  const switchMethod=(value:Method)=>{if(value===method)return;stop();setMethod(value);setPhase("idle");setStart(null);setError("");setInvalid(false);setAnnounce("");if(value==="qr")void begin("qr")};
  const submitId=(e:React.FormEvent)=>{e.preventDefault();const value=normaliseNationalId(nationalId);setNationalId(value);if(!validNationalId(value)){setInvalid(true);document.getElementById(`${uid}-rd`)?.focus();return}setInvalid(false);void begin("id")};
  const methods:Method[]=["id","qr"];
  const onTabKey=(e:React.KeyboardEvent)=>{if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft"&&e.key!=="Home"&&e.key!=="End")return;e.preventDefault();
    const at=methods.indexOf(method),to=e.key==="Home"?0:e.key==="End"?methods.length-1:(at+(e.key==="ArrowRight"?1:-1)+methods.length)%methods.length;
    switchMethod(methods[to]);document.getElementById(`${uid}-tab-${methods[to]}`)?.focus()};
  const pending=phase==="starting"||phase==="waiting";
  const terminal=phase==="error"||phase==="expired"||phase==="refused";
  const bare=variant==="signin";
  const hintId=`${uid}-rd-hint`,errorId=`${uid}-rd-error`;
  // Only status messages speak. The card used to be one polite live region,
  // which read the countdown out every second for as long as it ran.
  return <div className={`eid-login ${compact?"eid-login--compact":""}`}>
    {!bare&&<header className="eid-login__head"><span><Fingerprint/></span><div><h2>{t("auth.eid.title")}</h2><p>{t("auth.eid.subtitle")}</p></div></header>}
    <div className="eid-tabs" role="tablist" aria-label={t("auth.eid.method_label")} onKeyDown={onTabKey}>
      {methods.map(value=><button key={value} type="button" role="tab" id={`${uid}-tab-${value}`} aria-selected={method===value} aria-controls={`${uid}-panel`} tabIndex={method===value?0:-1} className={method===value?"is-active":""} onClick={()=>switchMethod(value)}>{t(value==="id"?"auth.eid.tab_id":"auth.eid.tab_qr")}</button>)}
    </div>
    <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${method}`}>
    {bare&&method==="id"&&!pending&&<p className="signin-instruction">{t("auth.eid.instruction")}</p>}
    {error&&<p className="eid-alert eid-alert--error" role="alert">{error}</p>}{phase==="expired"&&<p className="eid-alert" role="alert">{t("auth.message.expired")}</p>}{phase==="refused"&&<p className="eid-alert eid-alert--error" role="alert">{t("auth.message.refused")}</p>}
    {method==="id"&&!pending&&<form onSubmit={submitId} noValidate><label htmlFor={`${uid}-rd`}>{t("auth.eid.reg_number")}</label>
      <input id={`${uid}-rd`} value={nationalId} onChange={e=>{setNationalId(normaliseNationalId(e.target.value));setInvalid(false)}} placeholder={t("auth.eid.reg_number_placeholder")} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus={bare} required minLength={8} maxLength={12}
        aria-invalid={invalid||undefined} aria-describedby={invalid?`${errorId} ${hintId}`:hintId}/>
      <small id={hintId} className="text-xs text-muted">{t("auth.eid.reg_number_hint")}</small>
      {invalid&&<p id={errorId} className="eid-alert eid-alert--error" role="alert">{t("auth.eid.reg_number_invalid")}</p>}
      <button type="submit" className="eid-primary"><Smartphone aria-hidden="true"/> {t("auth.eid.send_request")}</button></form>}
    {phase==="starting"&&<div className="eid-status" role="status"><RefreshCw className="animate-spin" aria-hidden="true"/> {t("auth.message.starting")}</div>}
    {phase==="waiting"&&start&&<div className="eid-wait">
      {/* On the phone that has the app, the button is the way in; the QR stays
          for scanning from a second phone. */}
      {method==="qr"&&onPhone&&start.app_link&&<a className="eid-primary" style={{width:"100%",textDecoration:"none"}} href={start.app_link}><ExternalLink aria-hidden="true"/> {t("auth.action.app_to_app")}</a>}
      {method==="qr"&&qrLink&&<div className="eid-qr"><QRCodeSVG value={qrLink} size={compact?154:190} level="L"/></div>}
      <p role="status">{t(method==="qr"?"auth.message.scan_qr":"auth.message.sent_push")}</p><small>{t("auth.eid.verification_code")}</small><strong>{start.verification_code}</strong><span><ShieldCheck aria-hidden="true"/> {t("auth.eid.confirm_hint")}</span>
      {hasDeadline(start)&&<span className="eid-countdown" aria-live="off">{t("auth.message.expires_in",{time:clock(left)})}</span>}
    </div>}
    <span className="sr-only" role="status">{phase==="waiting"?announce:""}</span>
    {pending&&<button type="button" className="eid-cancel" onClick={cancel}><X aria-hidden="true"/> {t("auth.action.cancel")}</button>}
    {phase==="success"&&<p className="eid-alert eid-alert--success" role="status">{t("auth.message.success")}</p>}
    {terminal&&<button type="button" className="eid-retry" onClick={()=>void begin(method)}><RefreshCw aria-hidden="true"/> {t("auth.action.retry")}</button>}
    {!link&&phase!=="success"&&<details className="mt-3 text-xs text-muted">
      <summary className="flex items-center gap-1.5 cursor-pointer min-h-[44px]"><HelpCircle aria-hidden="true" className="w-4 h-4"/> {t("auth.eid.no_app_title")}</summary>
      <p className="mt-1">{t("auth.eid.no_app_body")}</p>
      <p className="mt-1">{t("auth.eid.no_app_stores")}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><a className="underline text-accent" href={EID_APP_STORE_URL} target="_blank" rel="noopener noreferrer">App Store</a><a className="underline text-accent" href={EID_PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Google Play</a></p>
    </details>}
    </div>
    {!bare&&<footer><ShieldCheck aria-hidden="true"/> {t("auth.eid.footer")}</footer>}
  </div>
}
