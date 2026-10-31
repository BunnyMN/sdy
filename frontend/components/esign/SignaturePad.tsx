"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { PenLine, Type, Undo2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fieldClass } from "@/components/ui";

/**
 * A canvas the signer draws on, used by the HSM rail.
 *
 * The canvas is sized from its own layout box rather than fixed attributes.
 * A CSS-stretched canvas keeps its intrinsic pixel grid, so strokes land at
 * the wrong place on any width but the one it was authored at, and the
 * exported PNG comes out blurry on a high-density display.
 *
 * Strokes are kept as points relative to the box (0–1), not as pixels on the
 * bitmap. Resizing a canvas clears it, and the earlier version answered that by
 * throwing the signature away — on the first stroke, as it turned out, because
 * the effect that sized the canvas re-ran whenever "has ink" flipped. Kept as
 * data, the strokes are simply redrawn at the new size, and Undo is a pop.
 *
 * The pad itself is white in both themes on purpose: the PNG is stamped onto a
 * white PDF page, and dark ink on a dark pad would be a signature the signer
 * cannot see they have made.
 */

type Point = { x: number; y: number };
type Stroke = Point[];

const INK = "#1e293b";
const LINE_WIDTH = 2.5;
// A typed name is drawn in whatever cursive the device has; the stack ends in
// the generic family so something script-like always answers.
const SCRIPT_FONT = '"Segoe Script", "Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive';

export default function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const ids = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const size = useRef({ width: 0, height: 0 });
  // Kept in a ref so the parent passing a fresh callback each render does not
  // re-run the sizing effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [strokeCount, setStrokeCount] = useState(0);
  const typedRef = useRef("");
  const modeRef = useRef<"draw" | "type">("draw");

  /** Repaints everything from the stored strokes (or the typed name). */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height } = size.current;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;

    if (modeRef.current === "type") {
      const name = typedRef.current.trim();
      if (!name) return;
      let fontSize = Math.min(48, height * 0.45);
      ctx.font = `${fontSize}px ${SCRIPT_FONT}`;
      // Shrink until it fits with a margin either side.
      while (fontSize > 12 && ctx.measureText(name).width > width * 0.9) {
        fontSize -= 2;
        ctx.font = `${fontSize}px ${SCRIPT_FONT}`;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, width / 2, height / 2);
      return;
    }

    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        // A tap is a dot — the dot of an "i", a full stop after initials.
        ctx.beginPath();
        ctx.arc(stroke[0].x * width, stroke[0].y * height, LINE_WIDTH, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * width, stroke[0].y * height);
      for (const point of stroke.slice(1)) ctx.lineTo(point.x * width, point.y * height);
      ctx.stroke();
    }
  }, []);

  /** Tells the parent what the pad now holds. */
  const report = useCallback(() => {
    const canvas = canvasRef.current;
    const empty = modeRef.current === "type" ? !typedRef.current.trim() : strokes.current.length === 0;
    onChangeRef.current(empty || !canvas ? null : canvas.toDataURL("image/png"));
  }, []);

  // Mount-only: size the bitmap to the box, and on a real change of size
  // (rotation, a sidebar folding) redraw what was there instead of losing it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      if (rect.width === size.current.width && rect.height === size.current.height) return;
      const ratio = window.devicePixelRatio || 1;
      size.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Draw in CSS pixels; the transform handles the device ratio.
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      redraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / (rect.width || 1),
      y: (event.clientY - rect.top) / (rect.height || 1),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || mode !== "draw") return;
    // Capturing the pointer keeps a stroke attached to the canvas when the
    // finger slides past its edge mid-signature.
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = [positionOf(event)];
    strokes.current = [...strokes.current, current.current];
    redraw();
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current || disabled) return;
    current.current.push(positionOf(event));
    redraw();
  };

  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    current.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setStrokeCount(strokes.current.length);
    report();
  };

  const undo = () => {
    strokes.current = strokes.current.slice(0, -1);
    setStrokeCount(strokes.current.length);
    redraw();
    report();
  };

  const clear = () => {
    strokes.current = [];
    typedRef.current = "";
    setTyped("");
    setStrokeCount(0);
    redraw();
    report();
  };

  const switchMode = (next: "draw" | "type") => {
    if (next === mode) return;
    modeRef.current = next;
    setMode(next);
    redraw();
    report();
  };

  const instructionsId = `${ids}-instructions`;
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 min-h-9 px-3 text-xs font-medium rounded-md ${
      active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
    }`;
  const hasContent = mode === "type" ? !!typed.trim() : strokeCount > 0;

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""} aria-disabled={disabled || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span id={`${ids}-label`} className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {t("esign.view.step_signature")}
        </span>
        <div className="flex items-center gap-1">
          {mode === "draw" && (
            <button
              type="button"
              onClick={undo}
              disabled={strokeCount === 0}
              className="inline-flex items-center gap-1 min-h-9 px-2 text-xs text-muted hover:text-foreground disabled:opacity-40"
            >
              <Undo2 aria-hidden="true" className="w-3.5 h-3.5" />
              {t("esign.action.undo")}
            </button>
          )}
          <button
            type="button"
            onClick={clear}
            disabled={!hasContent}
            className="min-h-9 px-2 text-xs text-muted hover:text-foreground underline disabled:opacity-40"
          >
            {t("esign.action.clear")}
          </button>
        </div>
      </div>

      <div role="group" aria-label={t("esign.signature.mode")} className="inline-flex gap-1 p-1 mb-2 rounded-lg bg-surface-2">
        <button type="button" aria-pressed={mode === "draw"} onClick={() => switchMode("draw")} className={tabClass(mode === "draw")}>
          <PenLine aria-hidden="true" className="w-3.5 h-3.5" />
          {t("esign.signature.mode_draw")}
        </button>
        <button type="button" aria-pressed={mode === "type"} onClick={() => switchMode("type")} className={tabClass(mode === "type")}>
          <Type aria-hidden="true" className="w-3.5 h-3.5" />
          {t("esign.signature.mode_type")}
        </button>
      </div>

      {mode === "type" && (
        <div className="mb-2">
          <label htmlFor={`${ids}-typed`} className="block text-xs font-medium text-foreground mb-1">
            {t("esign.signature.typed_label")}
          </label>
          <input
            id={`${ids}-typed`}
            value={typed}
            maxLength={60}
            autoComplete="name"
            onChange={(event) => {
              setTyped(event.target.value);
              typedRef.current = event.target.value;
              redraw();
              report();
            }}
            className={fieldClass}
          />
        </div>
      )}

      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        role="img"
        aria-labelledby={`${ids}-label`}
        aria-describedby={instructionsId}
        // White in both themes — see the note at the top of the file.
        className={`w-full h-40 border-2 border-dashed border-input rounded-lg bg-white touch-none ${
          mode === "draw" ? "cursor-crosshair" : "cursor-default"
        }`}
      />
      <p id={instructionsId} className="text-xs text-muted mt-1.5">
        {mode === "draw" ? t("esign.signature.draw_hint") : t("esign.signature.type_hint")}
      </p>
    </div>
  );
}
