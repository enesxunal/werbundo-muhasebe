import { isPdfFile } from "@/lib/document/acceptedTypes";
import { resolveImageMimeFromFile } from "@/lib/vision/resolveImageMime";

async function heicToJpegBlob(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  if (!(blob instanceof Blob)) throw new Error("HEIC dönüştürülemedi.");
  return blob;
}

async function pdfFirstPageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const baseVp = page.getViewport({ scale: 1 });
  const maxW = 2400;
  const scale = baseVp.width > maxW ? maxW / baseVp.width : 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas oluşturulamadı.");
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  const mime = resolveImageMimeFromFile(file);
  const lower = (file.type ?? "").toLowerCase();
  if (lower === "image/heic" || lower === "image/heif" || mime === "image/heic" || /\.heic$/i.test(file.name)) {
    const jpeg = await heicToJpegBlob(file);
    return createImageBitmap(jpeg);
  }
  if (mime) {
    return createImageBitmap(
      file.type?.startsWith("image/") ? file : new Blob([await file.arrayBuffer()], { type: mime }),
    );
  }
  return createImageBitmap(file);
}

/** Dosyayı (görsel veya PDF 1. sayfa) canvas'a çizer */
export async function fileToSourceCanvas(file: File): Promise<HTMLCanvasElement> {
  if (isPdfFile(file)) return pdfFirstPageToCanvas(file);

  const bmp = await fileToImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close?.();
    throw new Error("Canvas oluşturulamadı.");
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return canvas;
}

export async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG oluşturulamadı."))),
      "image/jpeg",
      quality,
    );
  });
}

export function canvasToJpegFile(canvas: HTMLCanvasElement, baseName: string, quality = 0.92): Promise<File> {
  return canvasToJpegBlob(canvas, quality).then(
    (blob) => new File([blob], `${baseName.replace(/\.[^.]+$/, "") || "belge"}-islenmis.jpg`, { type: "image/jpeg" }),
  );
}
