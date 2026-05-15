import { getOpenCv } from "@/lib/document/loadOpenCv";
import { ensureJscanifyLoaded, type CornerPoints, type JScanifyInstance } from "@/lib/document/loadJscanify";

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Algılanan dört köşeden belgenin gerçek genişlik/yüksekliği (A4 varsayılmaz) */
function outputSizeFromCorners(c: CornerPoints): { w: number; h: number } {
  const w = Math.max(
    dist(c.topLeftCorner, c.topRightCorner),
    dist(c.bottomLeftCorner, c.bottomRightCorner),
  );
  const h = Math.max(
    dist(c.topLeftCorner, c.bottomLeftCorner),
    dist(c.topRightCorner, c.bottomRightCorner),
  );
  return { w: Math.round(w), h: Math.round(h) };
}

function quadArea(c: CornerPoints): number {
  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

function isValidCorners(c: CornerPoints, imgW: number, imgH: number): boolean {
  const corners = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const imgArea = imgW * imgH;
  const area = quadArea(c);
  if (area < imgArea * 0.08) return false;
  if (area > imgArea * 0.98) return false;
  const { w, h } = outputSizeFromCorners(c);
  return w >= 80 && h >= 80;
}

/** Köşe bulma için hafif kontrast (çıktıyı değiştirmez) */
function canvasForDetection(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.filter = "contrast(1.15) brightness(1.05) saturate(1.1)";
  ctx.drawImage(source, 0, 0);
  ctx.filter = "none";
  return out;
}

async function loadImageFromCanvas(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  const img = document.createElement("img");
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = canvas.toDataURL("image/jpeg", 0.96);
  });
  return img;
}

async function tryExtractFromCanvas(
  scanner: JScanifyInstance,
  source: HTMLCanvasElement,
  extractSource: HTMLCanvasElement,
): Promise<HTMLCanvasElement | null> {
  const cv = getOpenCv();
  if (!cv?.imread) return null;

  const detectCanvas = canvasForDetection(source);
  const mat = cv.imread(detectCanvas);
  let contour: { delete: () => void } | null = null;

  try {
    contour = scanner.findPaperContour(mat);
    const corners = scanner.getCornerPoints(contour);
    if (!isValidCorners(corners, source.width, source.height)) return null;

    let { w, h } = outputSizeFromCorners(corners);
    const maxEdge = 2400;
    if (Math.max(w, h) > maxEdge) {
      const s = maxEdge / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }

    const img = await loadImageFromCanvas(extractSource);
    const result = scanner.extractPaper(img, w, h, corners);
    if (!result || !(result instanceof HTMLCanvasElement)) return null;
    if (result.width < 32 || result.height < 32) return null;
    return result;
  } catch {
    return null;
  } finally {
    contour?.delete();
    mat.delete();
  }
}

/** Klasik perspektif: kağıt/fiş kenarlarından yakala, düzleştir (AI yok) */
export async function scanDocumentCanvas(source: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  try {
    const JScanify = await ensureJscanifyLoaded();
    const scanner = new JScanify();

    let result = await tryExtractFromCanvas(scanner, source, source);
    if (result) return result;

    const img = await loadImageFromCanvas(source);
    if (scanner.highlightPaper) {
      const highlighted = scanner.highlightPaper(img, { color: "#22c55e", thickness: 8 });
      result = await tryExtractFromCanvas(scanner, highlighted, source);
      if (result) return result;
    }

    return null;
  } catch {
    return null;
  }
}

/** Tarama yoksa: boyut sınırı + hafif kontrast */
export function normalizeCanvasFallback(source: HTMLCanvasElement): HTMLCanvasElement {
  const maxW = 2400;
  let w = source.width;
  let h = source.height;
  if (w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.filter = "contrast(1.06) brightness(1.02)";
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = "none";
  return out;
}
