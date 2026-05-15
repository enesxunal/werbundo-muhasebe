import { assertSupportedDocumentFile } from "@/lib/document/acceptedTypes";
import { canvasToJpegBlob, canvasToJpegFile, fileToSourceCanvas } from "@/lib/document/fileToCanvas";
import { rotateCanvas90 } from "@/lib/document/rotateCanvas";
import { blobToCanvas } from "@/lib/document/blobToCanvas";
import { hasGoodContentSpread } from "@/lib/document/validateScanResult";

export type PreparedDocument = {
  /** Kullanıcının seçtiği ham dosya */
  originalFile: File;
  /** OCR / AI için düzeltilmiş JPEG */
  workFile: File;
  /** Storage'a kaydedilecek işlenmiş görsel */
  processedBlob: Blob;
  /** Köşe düzeltmesi onaylandı mı */
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
  onStatus?.("ready");

  const processedBlob = await canvasToJpegBlob(source, 0.92);
  const base = file.name.replace(/\.[^.]+$/, "") || "belge";
  const workFile = await canvasToJpegFile(source, base, 0.92);
  const previewUrl = URL.createObjectURL(processedBlob);

  return {
    originalFile: file,
    workFile,
    processedBlob,
    scanApplied: false,
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
  const ok = hasGoodContentSpread(resultCanvas);
  return {
    ...prepared,
    workFile,
    processedBlob,
    scanApplied: ok,
    previewUrl: URL.createObjectURL(processedBlob),
  };
}

/** Köşe ayarı yapmadan orijinali kullan */
export function acceptOriginalDocument(prepared: PreparedDocument): PreparedDocument {
  revokePreparedPreview(prepared);
  return { ...prepared, scanApplied: true };
}

/** Önizlemeyi 90° döndür (yanlış yön düzeltmesi) */
export async function rotatePreparedDocument(
  prepared: PreparedDocument,
  direction: "cw" | "ccw",
): Promise<PreparedDocument> {
  const canvas = await blobToCanvas(prepared.processedBlob);
  return applyManualScanResult(prepared, rotateCanvas90(canvas, direction));
}

export function revokePreparedPreview(prepared: PreparedDocument | null) {
  if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
}
