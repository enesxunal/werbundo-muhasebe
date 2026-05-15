import { assertSupportedDocumentFile } from "@/lib/document/acceptedTypes";
import { canvasToJpegBlob, canvasToJpegFile, fileToSourceCanvas } from "@/lib/document/fileToCanvas";
import { normalizeCanvasFallback, scanDocumentCanvas } from "@/lib/document/scanDocument";

export type PreparedDocument = {
  /** Kullanıcının seçtiği ham dosya */
  originalFile: File;
  /** OCR / AI için düzeltilmiş JPEG */
  workFile: File;
  /** Storage'a kaydedilecek işlenmiş görsel */
  processedBlob: Blob;
  /** jscanify ile köşe düzeltmesi uygulandı mı */
  scanApplied: boolean;
  previewUrl: string;
};

export async function prepareDocumentFiles(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<PreparedDocument> {
  assertSupportedDocumentFile(file);
  onStatus?.("load");

  const source = await fileToSourceCanvas(file);
  onStatus?.("scan");

  let processed = await scanDocumentCanvas(source);
  let scanApplied = Boolean(processed);
  if (!processed) {
    processed = normalizeCanvasFallback(source);
    scanApplied = false;
  }

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
  };
}

export function revokePreparedPreview(prepared: PreparedDocument | null) {
  if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
}
