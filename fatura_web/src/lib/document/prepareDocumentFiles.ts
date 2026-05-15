import { assertSupportedDocumentFile } from "@/lib/document/acceptedTypes";
import { canvasToJpegBlob, canvasToJpegFile, fileToSourceCanvas } from "@/lib/document/fileToCanvas";
import { normalizeCanvasFallback, scanDocumentCanvas } from "@/lib/document/scanDocument";
import { isMeaningfulScanOutput } from "@/lib/document/validateScanResult";

export type PreparedDocument = {
  /** Kullanıcının seçtiği ham dosya */
  originalFile: File;
  /** OCR / AI için düzeltilmiş JPEG */
  workFile: File;
  /** Storage'a kaydedilecek işlenmiş görsel */
  processedBlob: Blob;
  /** Gerçek köşe/kırpma düzeltmesi uygulandı mı */
  scanApplied: boolean;
  previewUrl: string;
  /** Elle köşe ayarı için ham canvas */
  sourceCanvas: HTMLCanvasElement;
};

export async function prepareDocumentFiles(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<PreparedDocument> {
  assertSupportedDocumentFile(file);
  onStatus?.("load");

  const source = await fileToSourceCanvas(file);
  onStatus?.("scan");

  const scanned = await scanDocumentCanvas(source);
  const scanApplied = Boolean(scanned && isMeaningfulScanOutput(source, scanned));
  const processed = scanApplied && scanned ? scanned : normalizeCanvasFallback(source);

  const processedBlob = await canvasToJpegBlob(processed, 0.92);
  const base = file.name.replace(/\.[^.]+$/, "") || "belge";
  const workFile = await canvasToJpegFile(processed, base, 0.92);
  const previewUrl = URL.createObjectURL(processedBlob);

  return {
    originalFile: file,
    workFile,
    processedBlob,
    scanApplied,
    previewUrl,
    sourceCanvas: source,
  };
}

/** Elle köşe düzeltmesi sonrası önizlemeyi güncelle */
export async function applyManualScanResult(
  prepared: PreparedDocument,
  resultCanvas: HTMLCanvasElement,
): Promise<PreparedDocument> {
  revokePreparedPreview(prepared);
  const processedBlob = await canvasToJpegBlob(resultCanvas, 0.92);
  const base = prepared.originalFile.name.replace(/\.[^.]+$/, "") || "belge";
  const workFile = await canvasToJpegFile(resultCanvas, base, 0.92);
  return {
    ...prepared,
    workFile,
    processedBlob,
    scanApplied: true,
    previewUrl: URL.createObjectURL(processedBlob),
  };
}

export function revokePreparedPreview(prepared: PreparedDocument | null) {
  if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
}
