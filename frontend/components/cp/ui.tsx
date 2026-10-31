"use client";

/**
 * The console's small shared pieces: a card, a table, a badge, and the one
 * date formatter every screen uses.
 *
 * They lived in the tenant detail page for a phase, and four other screens
 * imported them from it — a page importing a page, which works and reads as an
 * accident. This is where they belong.
 *
 * They are adapters now onto components/ui, which the module kit and the
 * workspace screens use too. The console kept its own names — `red`, `amber`,
 * `emerald` — and those stay, so no screen changes; what changed is that the
 * colours behind them are the status tokens, readable in dark mode, and the
 * table scrolls sideways, keeps its header row and names its columns.
 */

import React from "react";

import { Badge as UIBadge, Card as UICard, Table as UITable, type BadgeTone } from "@/components/ui";

export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <UICard title={title} action={action}>
      {children}
    </UICard>
  );
}

export function Table({
  head,
  rows,
  empty,
  loading,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
  /** The first load is still out: skeleton rows rather than the empty sentence. */
  loading?: boolean;
}) {
  return <UITable head={head} rows={rows} empty={empty} loading={loading} />;
}

export type Tone = "red" | "amber" | "emerald" | "slate" | "green";

// `green` and `emerald` are the same colour under two names, because two
// screens were written months apart. Both stay.
const TONES: Record<Tone, BadgeTone> = {
  red: "danger",
  amber: "warning",
  emerald: "success",
  green: "success",
  slate: "neutral",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <UIBadge tone={TONES[tone] ?? "neutral"}>{children}</UIBadge>;
}

/**
 * Re-exported so the console's screens keep importing it from here.
 *
 * The implementation moved to lib/datetime.ts when the format did: every
 * timestamp on the platform is now `yyyy-MM-dd HH:mm` in Asia/Ulaanbaatar,
 * not the reader's own locale and zone. The reasoning is written out there.
 */
export { formatMoment } from "@/lib/datetime";
