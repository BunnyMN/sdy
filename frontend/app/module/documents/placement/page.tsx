"use client";

import React, { useEffect, useState } from "react";
import { Move, RotateCcw, Save } from "lucide-react";
import { esign, type Placement } from "@/lib/esign";
import { useI18n } from "@/lib/i18n";
import { Banner, Loading, PageHeader, fieldClass } from "@/components/ui";
import { Card, useErrorMessage } from "@/components/esign/shared";

/** A4 in PostScript points — the page the preview and the limits are drawn to. */
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

/**
 * Where the stamp lands on the page.
 *
 * The eSign service measures from the TOP-LEFT corner, unlike the PDF
 * specification's bottom-left origin. The preview below is therefore drawn the
 * same way round, so the numbers in the form and the box on the page agree —
 * getting that backwards is how a signature ends up off the paper while the
 * document still reports itself signed.
 */
export default function EsignPlacementPage() {
  const { t } = useI18n();
  const describe = useErrorMessage();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    esign
      .settings()
      .then((settings) => setPlacement(settings.placement))
      .catch((err) => setError(describe(err, t("base.message.error"))))
      .finally(() => setLoading(false));
  }, [describe, t]);

  const update = (patch: Partial<Placement>) =>
    setPlacement((current) => (current ? { ...current, ...patch } : current));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!placement) return;
    setSaving(true);
    setError(null);
    try {
      setPlacement(await esign.savePlacement(placement));
      setNotice(t("esign.message.placement_saved"));
    } catch (err) {
      setError(describe(err, t("base.message.error")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (!placement) return <Banner tone="error" message={error ?? t("base.message.error")} />;

  const offPage =
    placement.x + placement.width > A4_WIDTH || placement.y + placement.height > A4_HEIGHT;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Move aria-hidden="true" className="w-7 h-7 text-accent" />}
        title={t("esign.view.placement_title")}
        subtitle={t("esign.view.placement_subtitle")}
      />

      {error && <Banner tone="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice(null)} />}
      {offPage && <Banner tone="error" message={t("esign.message.placement_off_page")} />}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Card title={t("esign.view.placement_form")}>
          <form onSubmit={save} className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                id="place-x"
                label={t("esign.field.x")}
                hint={t("esign.field.x_hint")}
                value={placement.x}
                min={0}
                max={A4_WIDTH}
                onChange={(x) => update({ x })}
              />
              <NumberField
                id="place-y"
                label={t("esign.field.y")}
                hint={t("esign.field.y_hint")}
                value={placement.y}
                min={0}
                max={A4_HEIGHT}
                onChange={(y) => update({ y })}
              />
              <NumberField
                id="place-w"
                label={t("esign.field.width")}
                value={placement.width}
                min={40}
                max={A4_WIDTH}
                onChange={(width) => update({ width })}
              />
              <NumberField
                id="place-h"
                label={t("esign.field.height")}
                value={placement.height}
                min={20}
                max={A4_HEIGHT}
                onChange={(height) => update({ height })}
              />
            </div>

            <div>
              <label htmlFor="place-page" className="block text-xs font-semibold text-foreground mb-1">
                {t("esign.field.page_number")}
              </label>
              <input
                id="place-page"
                type="number"
                min={0}
                value={placement.page_number}
                onChange={(event) => update({ page_number: Number(event.target.value) })}
                className={fieldClass}
              />
              <p className="text-2xs text-muted mt-1">{t("esign.field.page_number_hint")}</p>
            </div>

            <div>
              <label htmlFor="place-text" className="block text-xs font-semibold text-foreground mb-1">
                {t("esign.field.caption")}
              </label>
              <input
                id="place-text"
                value={placement.text}
                maxLength={120}
                onChange={(event) => update({ text: event.target.value })}
                className={fieldClass}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setPlacement({ x: 80, y: 216, width: 200, height: 56, page_number: 0, text: "Тоон гарын үсгээр баталгаажив." })
                }
                className="min-h-11 bg-surface-2 hover:bg-surface-hover border border-line text-foreground text-xs font-medium px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t("esign.action.reset_default")}
              </button>
              <button
                type="submit"
                disabled={saving || offPage}
                aria-busy={saving || undefined}
                className="min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? t("base.message.saving") : t("base.action.save")}
              </button>
            </div>
          </form>
        </Card>

        <Card title={t("esign.view.placement_preview")}>
          <div className="p-4">
            <div
              data-placement-page
              className="relative mx-auto bg-surface border border-input shadow-inner"
              style={{ width: "100%", maxWidth: 320, aspectRatio: `${A4_WIDTH} / ${A4_HEIGHT}` }}
            >
              {/* Percentages keep the preview faithful at any rendered width. */}
              <PlacementBox placement={placement} onChange={update} />
            </div>
            <p className="text-2xs text-muted mt-3 text-center">
              {t("esign.message.placement_preview_hint", { width: A4_WIDTH, height: A4_HEIGHT })}
            </p>
            <p id="placement-drag-hint" className="text-2xs text-muted mt-1 text-center">
              {t("esign.message.placement_drag_hint")}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

const MIN_WIDTH = 40;
const MIN_HEIGHT = 20;
const clamp = (value: number, low: number, high: number) => Math.round(Math.min(high, Math.max(low, value)));

/**
 * The stamp on the preview page, which can be moved and resized directly.
 *
 * Drag the box to move it, drag its corner to resize; arrow keys nudge it by a
 * point (Shift: ten), and Alt with an arrow resizes. The numbers on the left
 * stay the source of truth — this only writes to them — so a placement can
 * still be typed exactly.
 */
function PlacementBox({
  placement,
  onChange,
}: {
  placement: Placement;
  onChange: (patch: Partial<Placement>) => void;
}) {
  const { t } = useI18n();
  const drag = React.useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: Placement;
    scale: number;
  } | null>(null);

  const begin = (mode: "move" | "resize") => (event: React.PointerEvent<HTMLElement>) => {
    const page = event.currentTarget.closest("[data-placement-page]") as HTMLElement | null;
    if (!page) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: placement,
      // Screen pixels to PDF points.
      scale: A4_WIDTH / page.getBoundingClientRect().width,
    };
  };

  const moveTo = (event: React.PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = (event.clientX - state.startX) * state.scale;
    const dy = (event.clientY - state.startY) * state.scale;
    const { origin } = state;
    if (state.mode === "move") {
      onChange({
        x: clamp(origin.x + dx, 0, A4_WIDTH - origin.width),
        y: clamp(origin.y + dy, 0, A4_HEIGHT - origin.height),
      });
    } else {
      onChange({
        width: clamp(origin.width + dx, MIN_WIDTH, A4_WIDTH - origin.x),
        height: clamp(origin.height + dy, MIN_HEIGHT, A4_HEIGHT - origin.y),
      });
    }
  };

  const end = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    if (event.altKey) {
      onChange({
        width: clamp(placement.width + move[0], MIN_WIDTH, A4_WIDTH - placement.x),
        height: clamp(placement.height + move[1], MIN_HEIGHT, A4_HEIGHT - placement.y),
      });
    } else {
      onChange({
        x: clamp(placement.x + move[0], 0, A4_WIDTH - placement.width),
        y: clamp(placement.y + move[1], 0, A4_HEIGHT - placement.height),
      });
    }
  };

  return (
    <div
      role="group"
      tabIndex={0}
      aria-roledescription={t("esign.field.placement_box")}
      aria-label={t("esign.message.placement_box_label", {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      })}
      aria-describedby="placement-drag-hint"
      onKeyDown={onKeyDown}
      onPointerDown={begin("move")}
      onPointerMove={moveTo}
      onPointerUp={end}
      onPointerCancel={end}
      className="absolute bg-accent-soft/70 border-2 border-dashed border-accent flex items-end justify-center cursor-move touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{
        left: `${(placement.x / A4_WIDTH) * 100}%`,
        top: `${(placement.y / A4_HEIGHT) * 100}%`,
        width: `${(placement.width / A4_WIDTH) * 100}%`,
        height: `${(placement.height / A4_HEIGHT) * 100}%`,
      }}
    >
      <span className="text-2xs text-accent font-semibold truncate px-1 pb-0.5 pointer-events-none">
        {placement.text}
      </span>
      {/* The resize handle: a corner big enough to catch with a finger. */}
      <span
        aria-hidden="true"
        onPointerDown={begin("resize")}
        onPointerMove={moveTo}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute -right-2 -bottom-2 w-4 h-4 rounded-sm bg-accent border-2 border-surface cursor-nwse-resize touch-none"
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-foreground mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={fieldClass}
      />
      {hint && <p className="text-2xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
