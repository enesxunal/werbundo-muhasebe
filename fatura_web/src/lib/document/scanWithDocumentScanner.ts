import { ensureOpenCvLoaded } from "@/lib/document/loadOpenCv";
import { isMeaningfulScanOutput } from "@/lib/document/validateScanResult";

/** opencv-document-scanner — fiş/fatura için daha güvenilir algılama */
export async function scanWithDocumentScanner(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<HTMLCanvasElement | null> {
  await ensureOpenCvLoaded();
  const { DocumentScanner } = await import("opencv-document-scanner");
  const scanner = new DocumentScanner();

  for (const useCanny of [false, true] as const) {
    try {
      const points = scanner.detect(source, { useCanny });
      if (!points || points.length !== 4) continue;
      const cropped = scanner.crop(source, points);
      if (cropped && isMeaningfulScanOutput(source as HTMLCanvasElement, cropped)) {
        return cropped;
      }
    } catch {
      /* sonraki yöntemi dene */
    }
  }
  return null;
}
