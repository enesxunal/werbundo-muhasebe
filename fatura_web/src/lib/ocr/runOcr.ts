import Tesseract from "tesseract.js";
import { extractInvoiceFields, type OcrExtract } from "@/lib/ocr/extract";

export type OcrProgress = { status: string; progress: number };

const OCR_TIMEOUT_MS = 240_000;
const OCR_MAX_WIDTH = 1800;

function tesseractStatusTr(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("recognizing")) return "Metin okunuyor (OCR)";
  if (s.includes("loading") && s.includes("language")) return "Dil paketi yükleniyor";
  if (s.includes("loading") && s.includes("tesseract")) return "OCR motoru yükleniyor";
  if (s.includes("initializing")) return "OCR başlatılıyor";
  return status;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Büyük ekran görüntülerinde Tesseract takılmasını azaltır. */
async function downscaleForOcrIfNeeded(dataUrl: string): Promise<string> {
  try {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    let w = bmp.width;
    let h = bmp.height;
    if (w <= OCR_MAX_WIDTH) {
      bmp.close?.();
      return dataUrl;
    }
    h = Math.round((h * OCR_MAX_WIDTH) / w);
    w = OCR_MAX_WIDTH;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return dataUrl;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return dataUrl;
  }
}

export async function runInvoiceOcr(args: {
  file: File;
  onProgress?: (p: OcrProgress) => void;
}): Promise<{ text: string; extracted: OcrExtract }> {
  const { file, onProgress } = args;

  // PDF istemci OCR için şimdilik yok (foto odaklı)
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("PDF için OCR şimdilik kapalı. Lütfen fotoğraf (JPG/PNG/WebP) yükleyin.");
  }

  // HEIC/HEIF bazı tarayıcılarda decode edilemeyebilir
  if (/\.(heic|heif)$/i.test(file.name)) {
    throw new Error("HEIC/HEIF bazı tarayıcılarda OCR’a uygun olmayabilir. iPhone'da 'En Uyumlu (JPEG)' ile deneyin.");
  }

  let image = await fileToDataUrl(file);
  image = await downscaleForOcrIfNeeded(image);

  const recognizePromise = Tesseract.recognize(image, "tur+eng", {
    logger: (m) => {
      if (!onProgress) return;
      const raw = typeof m.progress === "number" ? m.progress : 0;
      const p = raw > 1 ? Math.min(1, raw / 100) : Math.min(1, Math.max(0, raw));
      onProgress({ status: tesseractStatusTr(String(m.status ?? "working")), progress: p });
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    globalThis.setTimeout(() => {
      reject(
        new Error(
          "Metin okuma (OCR) çok uzun sürdü veya takıldı. Daha küçük bir JPG/PNG deneyin; mümkünse faturayı kırpın. Görüntü hazırlanırsa işlem doğrudan yapay zekâ ile devam eder.",
        ),
      );
    }, OCR_TIMEOUT_MS);
  });

  const { data } = await Promise.race([recognizePromise, timeoutPromise]);

  const text = (data?.text ?? "").trim();
  const extracted = extractInvoiceFields(text);
  return { text, extracted };
}

