import { ensureJscanifyLoaded } from "@/lib/document/loadJscanify";

/** Klasik perspektif düzeltme (AI yok). Başarısız olursa null. */
export async function scanDocumentCanvas(source: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  try {
    const JScanify = await ensureJscanifyLoaded();
    const scanner = new JScanify();

    const img = document.createElement("img");
    img.decoding = "async";
    const dataUrl = source.toDataURL("image/jpeg", 0.95);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Önizleme yüklenemedi."));
      img.src = dataUrl;
    });

    const maxW = Math.min(2400, img.naturalWidth || img.width);
    const ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width || 1);
    const paperW = maxW;
    const paperH = Math.max(1, Math.round(paperW * ratio));

    const result = scanner.extractPaper(img, paperW, paperH);
    if (!result || !(result instanceof HTMLCanvasElement)) return null;
    if (result.width < 32 || result.height < 32) return null;
    return result;
  } catch {
    return null;
  }
}

/** Tarama yoksa: boyut sınırı + hafif kontrast (yazıyı değiştirmez) */
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
