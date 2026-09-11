"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Fingerprint } from "lucide-react";

function destination() {
  try {
    const raw = sessionStorage.getItem("sdy.checkin");
    if (raw && JSON.parse(raw).expires > Date.now()) return "/member/check-in";
    sessionStorage.removeItem("sdy.checkin");
  } catch { /* Login still completes when storage is unavailable. */ }
  return "/member";
}

export default function EIDCallback() {
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get("sessionId") || params.get("session_id");
    if (!sid) { setError("eID session олдсонгүй"); return; }
    let stopped = false, running = false;
    const deadline = Date.now() + 5 * 60 * 1000;
    const tick = async () => {
      if (stopped || running) return;
      if (Date.now() > deadline) { stopped = true; setError("Нэвтрэх хүсэлт дууссан байна"); return; }
      running = true;
      try {
        const res = await api.pollEID(sid);
        if (stopped) return;
        if (res.state === "COMPLETE") { stopped = true; location.replace(destination()); }
        else if (res.state === "EXPIRED" || res.state === "REFUSED") { stopped = true; setError("Нэвтрэх хүсэлт дууссан байна"); }
      } catch { /* A temporary failure is retried until the request expires. */ }
      finally { running = false; }
    };
    const timer = setInterval(() => void tick(), 2000);
    void tick();
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  return <main className="eid-callback"><Fingerprint />{error ? <><h1>{error}</h1><a href="/login">Дахин нэвтрэх</a></> : <><h1>Нэвтрэлтийг баталгаажуулж байна</h1><p>eID Mongolia апп-аас ирсэн session-ийг шалгаж байна…</p></>}</main>;
}
