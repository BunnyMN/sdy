"use client";

/**
 * Pieces the organisation screens and the people screens share: the state
 * badge, the verified-people picker's search, the step-up prompt for the
 * dialogs that write without going through useAction, and a sortable column
 * header.
 *
 * Not a route — a file beside the pages, because a page module may only
 * export the page.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/cp/ui";
import { Banner } from "@/components/ui";
import { cp, StepUpRequired, type VerifiedPerson } from "@/lib/cp";
import { useI18n } from "@/lib/i18n";

/** Which of its three states an organisation is in. Deletion wins over suspension. */
export type TenantState = "active" | "suspended" | "deleting";

export function tenantState(tenant: { suspended_at: string | null; deletion_scheduled_at: string | null }): TenantState {
  if (tenant.deletion_scheduled_at) return "deleting";
  if (tenant.suspended_at) return "suspended";
  return "active";
}

export function TenantStateBadge({
  tenant,
}: {
  tenant: { suspended_at: string | null; deletion_scheduled_at: string | null };
}) {
  const { t } = useI18n();
  const state = tenantState(tenant);
  if (state === "deleting") return <Badge tone="red">{t("cp.state.deleting")}</Badge>;
  if (state === "suspended") return <Badge tone="amber">{t("cp.state.suspended")}</Badge>;
  return <Badge tone="emerald">{t("cp.state.active")}</Badge>;
}

/**
 * The red asterisk after a required field's label, as a pseudo-element: a
 * literal "*" would become part of the label's accessible name, and the
 * field's `required` already tells a screen reader.
 */
export const requiredLabel = "after:ml-0.5 after:text-danger after:content-['*']";

/**
 * The people this deployment has watched sign in with eID, searched as the
 * operator types.
 *
 * Debounced, so a name is one request rather than one per letter, and guarded
 * against answers arriving out of order: without it a slow reply to "Ба"
 * could land after the fast one to "Бат" and replace the list the operator is
 * reading with the wrong one.
 */
export function useVerifiedPeople(onError: (message: string) => void) {
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<VerifiedPerson[]>([]);
  const [directory, setDirectory] = useState(true);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const load = useCallback(async (query: string) => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const answer = await cp.verifiedPeople(query);
      if (ticket !== latest.current) return;
      setPeople(answer.people);
      setDirectory(answer.directory);
    } catch (error) {
      if (ticket !== latest.current) return;
      onErrorRef.current(error instanceof Error ? error.message : String(error));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  return { search, setSearch, people, directory, loading };
}

/**
 * The authenticator-code half of useAction, for the dialogs that collect more
 * than a reason and so cannot be a useAction.
 *
 * Same order as there: the code field appears only once the server has asked
 * for it, and on the next submit the step-up is proved first and the write
 * done second — never stepped up as a side effect of leaving a field.
 *
 *   const stepUp = useStepUp();
 *   await stepUp.run(() => cp.addMember(...));   // throws on failure; StepUpRequired shows the field
 *   {stepUp.prompt}{stepUp.field}
 */
export function useStepUp() {
  const { t } = useI18n();
  const [needsCode, setNeedsCode] = useState(false);
  const [asked, setAsked] = useState(false);
  const [code, setCode] = useState("");

  const run = useCallback(
    async <T,>(perform: () => Promise<T>): Promise<T> => {
      if (needsCode) await cp.stepUp(code);
      try {
        const result = await perform();
        setAsked(false);
        return result;
      } catch (error) {
        if (error instanceof StepUpRequired) {
          setNeedsCode(true);
          setAsked(true);
          setCode("");
        }
        throw error;
      }
    },
    [code, needsCode],
  );

  const prompt = asked ? <Banner tone="warning" message={t("cp.message.step_up")} /> : null;
  const field = needsCode ? (
    <label className="block text-sm">
      <span className={`text-muted ${requiredLabel}`}>{t("cp.field.code")}</span>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        required
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 font-mono tracking-[0.4em]"
      />
      <small className="text-xs text-muted">{t("cp.hint.step_up")}</small>
    </label>
  ) : null;

  return { run, prompt, field, isStepUp: (error: unknown) => error instanceof StepUpRequired };
}

export type SortDirection = "asc" | "desc";

/**
 * A column header that sorts by it. The arrow says which way; the accessible
 * name says it in words, because an arrow glyph read aloud is just "arrow".
 */
export function SortHeader({
  label,
  column,
  sort,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  column: string;
  sort: string;
  direction: SortDirection;
  onSort: (column: string) => void;
  align?: "left" | "right";
}) {
  const { t } = useI18n();
  const active = sort === column;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={
        active
          ? t(direction === "asc" ? "cp.sort.ascending" : "cp.sort.descending", { column: label })
          : t("cp.sort.by", { column: label })
      }
      className={`inline-flex items-center gap-1 font-medium hover:text-foreground ${
        active ? "text-foreground" : ""
      } ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {label}
      <Icon aria-hidden="true" className={`w-3.5 h-3.5 ${active ? "" : "opacity-40"}`} />
    </button>
  );
}

/**
 * Compare two values for a column sort: numbers numerically, text by locale.
 * Blanks go last whichever way the column is sorted — "never signed in" is not
 * the earliest sign-in.
 */
export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  direction: SortDirection = "asc",
): number {
  const blankA = a === null || a === undefined || a === "";
  const blankB = b === null || b === undefined || b === "";
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
  const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return direction === "asc" ? order : -order;
}
