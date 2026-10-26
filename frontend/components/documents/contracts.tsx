"use client";

/**
 * The pieces the two contract screens share: state labels, badges, and the
 * PIN2 ceremony button.
 *
 * The ceremony has one rule: KEEP ASKING. The signature is recorded inside the
 * poll handler on the server, so if nobody polls, a citizen's approved
 * signature is never written. Poll every 3 seconds until a terminal state.
 */

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Loader2, Smartphone } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui";
import { useErrorMessage } from "@/lib/useErrorMessage";
import type { CeremonyProgress, CeremonySession, ContractState, PartyState } from "@/lib/contracts";
import { formatDay, formatMoment, formatMoney } from "@/lib/datetime";

// ─────────────────────────────────────────────────────────────────── labels

// Tones, not palette classes: the amber/indigo/emerald pastels stayed pale in
// dark mode. One badge component for both — the platform's.
const CONTRACT_TONE: Record<ContractState, BadgeTone> = {
  NONE: "neutral",
  DRAFT: "neutral",
  SENT: "warning",
  PARTIALLY_SIGNED: "info",
  EXECUTED: "success",
  DECLINED: "danger",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
  TERMINATED: "neutral",
};

const PARTY_TONE: Record<PartyState, BadgeTone> = {
  draft: "neutral",
  invited: "warning",
  viewed: "info",
  signed: "success",
  declined: "danger",
  withdrawn: "neutral",
  expired: "neutral",
};

export function useContractLabels() {
  const { t } = useI18n();
  const contractState = (state: ContractState): string => {
    switch (state) {
      case "DRAFT": return t("contracts.state.draft");
      case "SENT": return t("contracts.state.sent");
      case "PARTIALLY_SIGNED": return t("contracts.state.partial");
      case "EXECUTED": return t("contracts.state.executed");
      case "DECLINED": return t("contracts.state.declined");
      case "WITHDRAWN": return t("contracts.state.withdrawn");
      case "EXPIRED": return t("contracts.state.expired");
      case "TERMINATED": return t("contracts.state.terminated");
      default: return "—";
    }
  };
  const partyState = (state: PartyState): string => {
    switch (state) {
      case "draft": return t("contracts.party_state.draft");
      case "invited": return t("contracts.party_state.invited");
      case "viewed": return t("contracts.party_state.viewed");
      case "signed": return t("contracts.party_state.signed");
      case "declined": return t("contracts.party_state.declined");
      case "withdrawn": return t("contracts.state.withdrawn");
      case "expired": return t("contracts.state.expired");
      default: return state;
    }
  };
  const partyRole = (role: string): string => {
    switch (role) {
      case "issuer": return t("contracts.role.issuer");
      case "counterparty": return t("contracts.role.counterparty");
      case "witness": return t("contracts.role.witness");
      case "guarantor": return t("contracts.role.guarantor");
      default: return role;
    }
  };
  const partyKind = (kind: string): string => {
    switch (kind) {
      case "member": return t("contracts.kind.member");
      case "tenant": return t("contracts.kind.tenant");
      case "person": return t("contracts.kind.person");
      case "organisation": return t("contracts.kind.organisation");
      default: return kind;
    }
  };
  return { contractState, partyState, partyRole, partyKind };
}

export function ContractBadge({ state }: { state: ContractState }) {
  const { contractState } = useContractLabels();
  return (
    <Badge tone={CONTRACT_TONE[state] ?? "neutral"} className="whitespace-nowrap">
      {contractState(state)}
    </Badge>
  );
}

export function PartyBadge({ state }: { state: PartyState }) {
  const { partyState } = useContractLabels();
  return (
    <Badge tone={PARTY_TONE[state] ?? "neutral"} className="whitespace-nowrap">
      {partyState(state)}
    </Badge>
  );
}

/** The coloured dot before a party's name in the progress strip. */
export function PartyDot({ state }: { state: PartyState }) {
  const color =
    state === "signed" ? "bg-success-solid" :
    state === "declined" ? "bg-danger-solid" :
    state === "invited" || state === "viewed" ? "bg-warning" : "bg-line-strong";
  return <span aria-hidden="true" className={`w-2 h-2 rounded-full ${color}`} />;
}

export function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : formatDay(d);
}

export function fmtWhen(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : formatMoment(d);
}

export function fmtMoney(amount?: number | null, currency?: string): string {
  if (amount === null || amount === undefined) return "";
  return formatMoney(amount, currency || "MNT");
}

// ───────────────────────────────────────────────────────────────── ceremony

/**
 * Starts a PIN2 ceremony and keeps asking until it settles.
 *
 * Three states the button used to collapse into two: idle, *starting* (the
 * request is out — the button is disabled so a second press cannot open a
 * second ceremony on the citizen's phone), and waiting on the phone with the
 * code. Waiting can be stopped from here; the ceremony on the phone then simply
 * runs out, and pressing again starts a fresh one.
 */
export function CeremonyButton({
  label,
  start,
  poll,
  onDone,
  onError,
  className,
  disabled = false,
}: {
  label: string;
  start: () => Promise<CeremonySession>;
  /** Receives the session start returned — the master-sign poll needs its id. */
  poll: (session: CeremonySession) => Promise<CeremonyProgress>;
  onDone: () => void | Promise<void>;
  /** Already translated: the reader's language, never the server's English. */
  onError: (message: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [phase, setPhase] = useState<"idle" | "starting" | "waiting">("idle");
  const [code, setCode] = useState<string | null>(null);
  // Which run is current. Unmounting or pressing Stop moves it on, and a loop
  // that finds itself no longer current stops without touching state.
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);

  const begin = async () => {
    if (phase !== "idle") return;
    const mine = ++run.current;
    const live = () => run.current === mine;
    setPhase("starting");
    try {
      const session = await start();
      if (!live()) return;
      setCode(session.verification_code || "····");
      setPhase("waiting");
      let failures = 0;
      while (live()) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (!live()) return;
        let progress: CeremonyProgress;
        try {
          progress = await poll(session);
        } catch (err) {
          // A 409 is an answer (settled elsewhere, bytes changed); a dropped
          // connection is not — the ceremony is still open on the phone.
          const status = (err as { status?: number }).status;
          if (status && status >= 400 && status < 500) {
            onError(errorMessage(err));
            break;
          }
          // Сервер огт хариулахаа больсон бол мөнхөд эргэлдэхгүй: 10 удаа
          // дараалан унавал (~30 сек) зогсоож хэлнэ — утсан дээрх ёслол
          // нээлттэй хэвээр, дахин дарахад асуулт үргэлжилнэ.
          failures += 1;
          if (failures >= 10) {
            onError(t("contracts.msg.poll_lost"));
            break;
          }
          continue;
        }
        failures = 0;
        if (progress.state === "COMPLETE") { await onDone(); break; }
        // Хоёр рельс хоёр өөр үгээр «хүлээж байна» гэдэг: талын зам PENDING,
        // мастерын зам RUNNING. Аль аль нь — асуусаар байх.
        if (progress.state === "PENDING" || progress.state === "RUNNING") continue;
        onError(
          progress.state === "REFUSED"
            ? t("contracts.msg.refused")
            : progress.state === "EXPIRED"
              ? t("contracts.msg.ceremony_expired")
              : t("contracts.msg.ceremony_failed"),
        );
        break;
      }
    } catch (err) {
      if (live()) onError(errorMessage(err));
    } finally {
      if (live()) {
        setCode(null);
        setPhase("idle");
      }
    }
  };

  const stop = () => {
    run.current += 1;
    setCode(null);
    setPhase("idle");
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {phase === "waiting" && code ? (
        <>
          <span className="bg-accent-soft text-accent border border-line text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-mono">
            <Smartphone aria-hidden="true" className="w-3.5 h-3.5 animate-pulse" />
            <span className="text-base tracking-widest">{code}</span>
            <span className="font-sans font-medium">{t("contracts.msg.check_phone")}</span>
          </span>
          <button
            type="button"
            onClick={stop}
            className="min-h-9 text-xs font-medium text-muted hover:text-foreground border border-line rounded-lg px-3 py-1.5 bg-surface hover:bg-surface-hover"
          >
            {t("contracts.action.stop_waiting")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void begin()}
          disabled={disabled || phase !== "idle"}
          aria-busy={phase === "starting" || undefined}
          className={`${
            className ??
            "min-h-9 bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
          } disabled:opacity-60`}
        >
          {phase === "starting" ? (
            <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Smartphone aria-hidden="true" className="w-3.5 h-3.5" />
          )}
          {phase === "starting" ? t("contracts.msg.ceremony_starting") : label}
        </button>
      )}
      {/* Outside the controls, so the code is read out once when it appears. */}
      <span className="sr-only" role="status" aria-live="polite">
        {phase === "starting"
          ? t("contracts.msg.ceremony_starting")
          : phase === "waiting" && code
            ? t("contracts.msg.ceremony_code", { code: code.split("").join(" ") })
            : ""}
      </span>
    </span>
  );
}
