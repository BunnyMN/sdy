"use client";

import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { errorText } from "@/lib/errorMessage";
import { Sparkles, X, Send, Bot, User, Mic, Square, Volume2, Languages, Wrench } from "lucide-react";

interface Message { role: "user" | "model"; text: string; tools?: string[]; degraded?: boolean }

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onerror=()=>reject(r.error); r.onload=()=>resolve(String(r.result).split(",")[1] || ""); r.readAsDataURL(blob); });
}
function play(audio: { mime: string; data: string }) { new Audio(`data:${audio.mime};base64,${audio.data}`).play().catch(() => undefined); }

export default function AICopilot() {
  const { t, locale } = useI18n();
  const [open,setOpen]=useState(false), [prompt,setPrompt]=useState(""), [loading,setLoading]=useState(false);
  const [mode,setMode]=useState<"chat"|"translate">("chat"), [target,setTarget]=useState("en"), [recording,setRecording]=useState(false);
  const [messages,setMessages]=useState<Message[]>([{role:"model",text:t("ai.message.greeting")}]);
  const recorder=useRef<MediaRecorder|null>(null), chunks=useRef<Blob[]>([]), end=useRef<HTMLDivElement>(null);
  // Smooth unless the reader asked the system for less motion: `behavior` in
  // script overrides the stylesheet's reduced-motion rule, so it is asked here.
  useEffect(()=>{
    const still=typeof window.matchMedia==="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({behavior:still?"auto":"smooth",block:"end"});
  },[messages,loading]);

  async function dispatch(text?: string, audio?: {mime:string;data:string}) {
    const value=(text ?? prompt).trim(); if ((!value && !audio)||loading) return;
    const shown=value || t("ai.message.voice_message"); const prior=messages.filter(m=>!m.degraded).slice(-20).map(({role,text})=>({role,text}));
    setMessages(m=>[...m,{role:"user",text:shown}]); setPrompt(""); setLoading(true);
    try {
      if(mode==="translate") {
        const r=await api.translateAI({text:value||undefined,audio,target_lang:target});
        setMessages(m=>[...m,{role:"model",text:r.translated}]);
      } else {
        const r=await api.chatAI({prompt:value||undefined,audio,lang:locale,history:prior});
        setMessages(m=>[...m,{role:"model",text:r.reply||r.answer,tools:r.steps?.map(s=>s.tool),degraded:r.degraded}]);
      }
    } catch(e) { setMessages(m=>[...m,{role:"model",text:errorText(e,t,{locale,fallback:"ai.message.request_failed"}),degraded:true}]); }
    finally {setLoading(false)}
  }

  async function toggleRecord() {
    if(recording){recorder.current?.stop();return}
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true}); const rec=new MediaRecorder(stream); chunks.current=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};
      rec.onstop=async()=>{setRecording(false);stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks.current,{type:rec.mimeType});await dispatch(undefined,{mime:rec.mimeType.split(";")[0],data:await toBase64(blob)})};
      recorder.current=rec;rec.start();setRecording(true);setTimeout(()=>{if(rec.state==="recording")rec.stop()},30000);
    } catch {setMessages(m=>[...m,{role:"model",text:t("ai.message.microphone_denied"),degraded:true}])}
  }

  async function speak(text:string){try{play(await api.speakAI(text.slice(0,2000)))}catch{/* response remains readable */}}

  // Escape closes it, as it does every other layer in this shell. A drawer that
  // can only be dismissed by finding its own close button is one people leave
  // open and then work around.
  useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[open]);

  // `gerege-copilot-trigger` is drawn in tokens here, which suits every light
  // chrome; globals.css repaints it white-on-blue for the original design's
  // saturated top bar. It used to be white-on-translucent everywhere, which on
  // the white bar of the gerege design was a white circle on white.
  return <>
    <button type="button" onClick={()=>setOpen(v=>!v)} aria-label={t("ai.view.title")} title={t("ai.view.title")} aria-expanded={open} aria-controls="gerege-copilot"
      className={`gerege-copilot-trigger w-11 h-11 rounded-full grid place-items-center border transition shrink-0 ${open?"is-open border-accent bg-accent-soft text-accent":"border-line bg-surface text-accent hover:bg-surface-hover"}`}><Sparkles aria-hidden="true" className="w-5 h-5"/></button>
    {/* Always mounted, moved rather than removed: a conversation that
        disappears when the drawer is shut is one nobody trusts to leave, and a
        panel that is only rendered while open cannot animate out. inert as
        well as aria-hidden, so Tab cannot walk into it while it is shut. */}
    <section id="gerege-copilot" aria-hidden={!open} inert={!open} aria-label={t("ai.view.subtitle")}
      className={`gerege-copilot-drawer bg-surface border-s border-line shadow-lg flex flex-col ${open?"is-open":""}`}>
      <header className="bg-chrome border-b border-line p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0"><Bot aria-hidden="true" className="w-5 h-5 text-accent shrink-0"/><div className="min-w-0"><h3 className="font-semibold text-sm text-foreground">{t("ai.view.subtitle")}</h3><p className="text-2xs text-muted">{t("ai.view.engine_note")}</p></div></div>
        <button type="button" onClick={()=>setOpen(false)} aria-label={t("base.action.close")} title={t("base.action.close")} className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"><X aria-hidden="true" className="w-5 h-5"/></button>
      </header>
      <div className="flex border-b border-line bg-surface-2 p-1 gap-1">{(["chat","translate"] as const).map(v=><button type="button" key={v} onClick={()=>setMode(v)} aria-pressed={mode===v} className={`flex-1 min-h-11 rounded-lg px-3 py-2 text-xs font-semibold ${mode===v?"bg-surface text-accent shadow-sm":"text-muted hover:text-foreground"}`}>{v==="chat"?<Bot aria-hidden="true" className="inline w-4 h-4 mr-1"/>:<Languages aria-hidden="true" className="inline w-4 h-4 mr-1"/>}{v==="chat"?t("ai.view.tab_chat"):t("ai.view.tab_translate")}</button>)}</div>
      {mode==="translate"&&<div className="px-3 py-2 border-b border-line text-xs flex items-center gap-2"><label htmlFor="gerege-copilot-target" className="text-foreground">{t("ai.field.target_language")}</label><select id="gerege-copilot-target" value={target} onChange={e=>setTarget(e.target.value)} className="min-h-9 border border-input bg-surface rounded px-2 py-1"><option value="mn">Монгол</option><option value="en">English</option><option value="ru">Русский</option><option value="zh">中文</option><option value="ko">한국어</option><option value="ja">日本語</option></select></div>}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs" aria-live="polite">{messages.map((m,i)=><div key={i} className={`flex gap-2 ${m.role==="user"?"justify-end":"justify-start"}`}>{m.role==="model"&&<Bot aria-hidden="true" className="w-4 h-4 mt-2 text-accent shrink-0"/>}<div className={`max-w-[85%] rounded-xl p-3 ${m.role==="user"?"bg-accent text-on-accent":"bg-surface-2 text-foreground border border-line"}`}><p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>{m.role==="model"&&!m.degraded&&<button type="button" onClick={()=>speak(m.text)} className="mt-1 -ml-2 -mb-2 grid h-11 w-11 place-items-center rounded-lg text-accent hover:bg-surface-hover" aria-label={t("ai.action.listen")} title={t("ai.action.listen")}><Volume2 aria-hidden="true" className="w-4 h-4"/></button>}{m.tools?.length?<p className="mt-2 text-2xs text-muted flex gap-1"><Wrench aria-hidden="true" className="w-3 h-3"/>{m.tools.join(", ")}</p>:null}</div>{m.role==="user"&&<User aria-hidden="true" className="w-4 h-4 mt-2 text-muted shrink-0"/>}</div>)}{loading&&<div role="status" className="text-muted animate-pulse">{t("ai.message.processing")}</div>}<div ref={end}/></div>
      <form onSubmit={e=>{e.preventDefault();void dispatch()}} className="p-3 border-t border-line bg-surface-2 flex items-center gap-2">
        <button type="button" onClick={()=>void toggleRecord()} disabled={loading} aria-pressed={recording} aria-label={t("ai.action.record")} title={t("ai.action.record")} className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg disabled:opacity-50 ${recording?"bg-danger-solid text-white":"border border-line bg-surface text-muted hover:text-foreground"}`}>{recording?<Square aria-hidden="true" className="w-4 h-4"/>:<Mic aria-hidden="true" className="w-4 h-4"/>}</button>
        <label htmlFor="gerege-copilot-input" className="sr-only">{t("ai.field.message")}</label>
        <input id="gerege-copilot-input" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={4000} placeholder={mode==="chat"?t("ai.view.placeholder"):t("ai.view.translate_placeholder")} className="flex-1 min-w-0 min-h-11 px-3 py-2 text-sm border border-input bg-surface rounded-lg"/>
        <button type="submit" disabled={loading||(!prompt.trim()&&!recording)} aria-label={t("ai.action.send")} title={t("ai.action.send")} className="grid h-11 w-11 shrink-0 place-items-center bg-accent text-on-accent rounded-lg hover:bg-accent-hover disabled:opacity-50"><Send aria-hidden="true" className="w-4 h-4"/></button>
      </form>
    </section>
  </>;
}
