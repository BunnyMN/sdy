"use client";

import {useMemo,useState} from "react";
import {api} from "@/lib/api";
import {useI18n} from "@/lib/i18n";
import {useLoadOnMount} from "@/lib/useResource";
import {useErrorMessage} from "@/lib/useErrorMessage";
import {Activity,KeyRound,MonitorCog,RefreshCw,ShieldCheck,WifiOff} from "lucide-react";
import {formatMoment} from "@/lib/datetime";
import {Badge,Banner,CopyButton,LoadingBlock,fieldClass,selectClass,useConfirm} from "@/components/ui";

type Device={id:string;name:string;platform:string;form_factor:string;site:string;status:string;app_version:string;os_version:string;last_seen_at?:string;enrolled_at:string};
type Member={membership_id:string;name:string;email:string};

/** Heard from within this long counts as online. */
const ONLINE_WITHIN=5*60_000;

/**
 * The organisation's devices: kiosks, POS terminals and mobile clients — who
 * is enrolled, who has been heard from, and the staff PIN for quick sign-in.
 */
export default function DeviceFleetPage(){
  const {t}=useI18n();
  const errorMessage=useErrorMessage();
  const [devices,setDevices]=useState<Device[]>([]),[members,setMembers]=useState<Member[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [code,setCode]=useState<{value:string;expires:string}|null>(null),[pin,setPin]=useState(""),[member,setMember]=useState("");
  const [now,setNow]=useState(()=>Date.now());
  async function load(){setLoading(true);setLoadError("");try{const [fleet,access]=await Promise.all([api.getDevices(),api.getAccessOverview()]);setDevices(fleet.devices);setMembers(access.members);setMember(v=>v||access.members[0]?.membership_id||"");setNow(Date.now())}catch(e){setLoadError(errorMessage(e,{fallback:"access.devices.load_failed"}))}finally{setLoading(false)}}
  useLoadOnMount(load);
  const isOnline=(d:Device)=>!!d.last_seen_at&&now-new Date(d.last_seen_at).getTime()<ONLINE_WITHIN;
  const online=devices.filter(isOnline).length;
  const groups=useMemo(()=>Object.entries(devices.reduce<Record<string,Device[]>>((all,d)=>{(all[d.site||""]??=[]).push(d);return all},{})),[devices]);
  async function issue(){setError("");try{const result=await api.createDeviceEnrollmentCode();setCode({value:result.code,expires:result.expires_at})}catch(e){setError(errorMessage(e,{fallback:"access.devices.issue_failed"}))}}
  async function savePin(){if(!member||!/^[0-9]{4,12}$/.test(pin))return;setError("");try{await api.setStaffPin(member,pin);setPin("");setNotice(t("access.devices.pin_saved"))}catch(e){setError(errorMessage(e,{fallback:"access.devices.pin_failed"}))}}
  function changed(d:Device,status:string){setDevices(all=>all.map(x=>x.id===d.id?{...x,status}:x))}

  if(loading&&devices.length===0&&!loadError)return <LoadingBlock label={t("access.devices.loading")}/>;
  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div><h1 className="flex items-center gap-3 text-2xl font-semibold text-foreground"><MonitorCog aria-hidden="true" className="h-7 w-7 text-accent"/>{t("access.devices.title")}</h1><p className="mt-2 max-w-2xl text-sm text-muted">{t("access.devices.subtitle")}</p></div>
      <button type="button" disabled={loading} aria-busy={loading||undefined} onClick={()=>void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-surface px-4 text-sm font-semibold hover:bg-surface-hover disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4${loading?" animate-spin":""}`}/>{t("access.devices.refresh")}</button>
    </header>
    {loadError&&<Banner tone="error" message={loadError}/>}
    {error&&<Banner tone="error" message={error} onDismiss={()=>setError("")}/>}
    {notice&&<Banner tone="success" message={notice} onDismiss={()=>setNotice("")}/>}
    {!loadError&&<section className="grid overflow-hidden rounded-xl border border-line bg-surface sm:grid-cols-3">
      <Metric label={t("access.devices.total")} value={devices.length}/>
      <Metric label={t("access.devices.online")} value={online}/>
      <Metric label={t("access.devices.attention")} value={devices.filter(d=>d.status!=="ACTIVE"||!d.last_seen_at).length} hint={t("access.devices.attention_hint")}/>
    </section>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">{loadError?null:groups.length===0
        ?<div className="rounded-xl border border-dashed border-input bg-surface p-10 text-center"><WifiOff aria-hidden="true" className="mx-auto h-8 w-8 text-muted"/><h2 className="mt-3 font-semibold">{t("access.devices.empty_title")}</h2><p className="mt-1 text-sm text-muted">{t("access.devices.empty_hint")}</p></div>
        :groups.map(([site,items])=><div key={site} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2"><h2 className="text-sm font-semibold text-foreground">{site||t("access.devices.no_site")}</h2><span className="text-xs text-muted">{t("access.devices.count",{count:items.length})}</span></div>
          <div className="divide-y divide-line">{items.map(d=><DeviceRow key={d.id} device={d} online={isOnline(d)} onChanged={changed} onError={setError}/>)}</div>
        </div>)}</section>
      <aside className="space-y-5">
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2"><KeyRound aria-hidden="true" className="h-5 w-5 text-accent"/><h2 className="font-semibold">{t("access.devices.enrol_title")}</h2></div>
          <p className="mt-2 text-xs leading-5 text-muted">{t("access.devices.enrol_hint")}</p>
          {code&&<div className="mt-4"><div className="flex items-center justify-between gap-2 border-y border-line py-3"><span className="font-mono text-xl font-semibold tracking-[.12em]">{code.value}</span><CopyButton value={code.value}/></div><p className="mt-2 text-xs text-muted tabular-nums">{t("access.devices.expires",{time:formatMoment(code.expires)})}</p></div>}
          <button type="button" onClick={()=>void issue()} className="mt-4 min-h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">{code?t("access.devices.issue_again"):t("access.devices.issue")}</button>
        </section>
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="h-5 w-5 text-foreground"/><h2 className="font-semibold">{t("access.devices.pin_title")}</h2></div>
          <p className="mt-2 text-xs leading-5 text-muted">{t("access.devices.pin_hint")}</p>
          <label className="mt-4 block text-xs font-semibold text-muted">{t("access.devices.pin_member")}<select value={member} onChange={e=>setMember(e.target.value)} className={`${selectClass} mt-1 min-h-11`}>{members.map(m=><option key={m.membership_id} value={m.membership_id}>{m.name} · {m.email}</option>)}</select></label>
          <label className="mt-3 block text-xs font-semibold text-muted">{t("access.devices.pin_new")}<input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,12))} className={`${fieldClass} mt-1 min-h-11 font-mono text-lg tracking-[.3em]`}/></label>
          <button type="button" disabled={!member||!/^[0-9]{4,12}$/.test(pin)} onClick={()=>void savePin()} className="mt-4 min-h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-40">{t("access.devices.pin_save")}</button>
        </section>
      </aside>
    </div>
  </div>
}

function Metric({label,value,hint}:{label:string;value:number;hint?:string}){return <div className="border-b border-line p-5 last:border-0 sm:border-b-0 sm:border-r"><p className="text-xs font-medium text-muted">{label}</p><div className="mt-1 flex items-baseline gap-3"><strong className="text-3xl font-semibold tabular-nums text-foreground">{value}</strong>{hint&&<span className="text-xs text-muted">{hint}</span>}</div></div>}

/**
 * One device. Deactivating is asked about first — a kiosk switched off by a
 * stray tap is a queue at the door — and the row changes only when the server
 * says it did, rather than reloading the whole page and hoping.
 */
function DeviceRow({device:d,online,onChanged,onError}:{device:Device;online:boolean;onChanged:(d:Device,status:string)=>void;onError:(message:string)=>void}){
  const {t}=useI18n();
  const errorMessage=useErrorMessage();
  const confirm=useConfirm();
  const [busy,setBusy]=useState(false);
  const active=d.status==="ACTIVE";
  async function toggle(){
    const next=active?"DISABLED":"ACTIVE";
    if(active&&!(await confirm({title:t("access.devices.deactivate_confirm",{name:d.name}),body:t("access.devices.deactivate_body"),confirmLabel:t("access.devices.deactivate"),tone:"danger"})))return;
    setBusy(true);onError("");
    try{await api.setDeviceStatus(d.id,next);onChanged(d,next)}
    catch(e){onError(errorMessage(e,{fallback:"access.devices.status_failed"}))}
    finally{setBusy(false)}
  }
  const statusLabel=d.status==="ACTIVE"?t("access.devices.status.active"):d.status==="DISABLED"?t("access.devices.status.disabled"):d.status;
  return <article className="grid gap-3 p-4 md:grid-cols-[minmax(160px,1fr)_auto_1fr_auto] md:items-center">
    <div className="min-w-0"><h3 className="flex items-center gap-2 font-semibold text-foreground"><span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${online?"bg-success":"bg-line-strong"}`}/>{d.name}<span className="sr-only">{online?t("access.devices.online_now"):t("access.devices.offline_now")}</span></h3><code className="break-all text-2xs text-muted">{d.id}</code></div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-muted">{d.platform} / {d.form_factor}</span><Badge tone={active?"success":"neutral"}>{statusLabel}</Badge>
      <button type="button" disabled={busy} aria-busy={busy||undefined} onClick={()=>void toggle()} className="min-h-11 rounded-lg border border-input px-3 text-xs font-semibold text-foreground hover:bg-surface-hover disabled:opacity-50">{active?t("access.devices.deactivate"):t("access.devices.activate")}</button></div>
    <div className="text-xs text-muted"><span className="block truncate">{d.os_version||t("access.devices.os_unknown")}</span><span className="block truncate">{t("access.devices.app_version",{version:d.app_version||"—"})}</span></div>
    <div className="flex items-center gap-1 text-xs text-muted tabular-nums md:justify-end"><Activity aria-hidden="true" className="h-4 w-4"/>{d.last_seen_at?formatMoment(d.last_seen_at):t("access.devices.never_seen")}</div>
  </article>
}
