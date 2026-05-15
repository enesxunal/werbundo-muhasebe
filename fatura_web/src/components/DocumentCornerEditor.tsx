"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ensureOpenCvLoaded } from "@/lib/document/loadOpenCv";
import { warpDocumentFromPoints } from "@/lib/document/opencvDocumentScan";
import { suggestCornersNormalized } from "@/lib/document/suggestCorners";
import { hasGoodContentSpread } from "@/lib/document/validateScanResult";
import { useI18n } from "@/lib/i18n/LocaleContext";

type NormPoint = { x: number; y: number };

type Props = {
  previewUrl: string;
  sourceCanvas: HTMLCanvasElement;
  onApplied: (result: HTMLCanvasElement) => void;
  onCancel?: () => void;
};

export function DocumentCornerEditor({ previewUrl, sourceCanvas, onApplied, onCancel }: Props) {
  const { t } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);
  const [corners, setCorners] = useState<NormPoint[]>(() => suggestCornersNormalized(sourceCanvas));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCorners(suggestCornersNormalized(sourceCanvas));
    setErr(null);
  }, [sourceCanvas]);

  const toNorm = useCallback((clientX: number, clientY: number): NormPoint | null => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    return { x, y };
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    if (dragIdx === null) return;
    const p = toNorm(e.clientX, e.clientY);
    if (!p) return;
    setCorners((prev) => prev.map((c, j) => (j === dragIdx ? p : c)));
  }

  function onPointerUp() {
    setDragIdx(null);
  }

  async function tryAutoDetect() {
    setBusy(true);
    setErr(null);
    try {
      await ensureOpenCvLoaded();
      const { DocumentScanner } = await import("opencv-document-scanner");
      const scanner = new DocumentScanner();
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const points =
        scanner.detect(sourceCanvas, { useCanny: false }) ||
        scanner.detect(sourceCanvas, { useCanny: true });
      if (!points || points.length !== 4) {
        setErr(t("doc.autoDetectFail"));
        return;
      }
      setCorners(points.map((p) => ({ x: p.x / w, y: p.y / h })));
    } catch {
      setErr(t("doc.autoDetectFail"));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const pts = corners.map((c) => ({ x: c.x * w, y: c.y * h }));
      const result = await warpDocumentFromPoints(sourceCanvas, pts);
      if (!result) throw new Error(t("doc.manualFail"));
      if (!hasGoodContentSpread(result)) throw new Error(t("doc.manualFailSpread"));
      onApplied(result);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">{t("doc.manualTitle")}</p>
      <p className="mt-1 text-xs text-amber-900">{t("doc.manualHint")}</p>

      <div
        ref={boxRef}
        className="relative mt-3 touch-none select-none overflow-hidden rounded-lg border-2 border-[var(--app-navy)]/30 bg-black/5"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <img src={previewUrl} alt="" className="block w-full object-contain" draggable={false} />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(" ")}
            fill="rgba(34,197,94,0.25)"
            stroke="#16a34a"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {corners.map((c, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Köşe ${i + 1}`}
            className="absolute z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[var(--app-navy)] shadow-lg"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              setDragIdx(i);
            }}
          />
        ))}
      </div>

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply()}
          className="rounded-lg bg-[var(--app-navy)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? t("common.loading") : t("doc.manualApply")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void tryAutoDetect()}
          className="rounded-lg border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm font-medium"
        >
          {t("doc.autoDetectBtn")}
        </button>
        {onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm"
          >
            {t("common.cancel")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
