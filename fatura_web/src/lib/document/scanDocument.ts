import { scanWithDocumentScanner } from "@/lib/document/scanWithDocumentScanner";
import { scanDocumentWithOpenCv, warpDocumentFromPoints } from "@/lib/document/opencvDocumentScan";

export { warpDocumentFromPoints };

/** Belge tarama: önce opencv-document-scanner, sonra yedek OpenCV kontur */
export async function scanDocumentCanvas(source: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  try {
    const primary = await scanWithDocumentScanner(source);
    if (primary) return primary;

    const fallback = await scanDocumentWithOpenCv(source);
    if (fallback) return fallback;

    return null;
  } catch {
    return null;
  }
}

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
