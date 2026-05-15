/** Tarayıcı file input accept — tüm yaygın görseller + PDF */
export const DOCUMENT_FILE_ACCEPT =
  "image/*,.pdf,application/pdf,.png,.jpg,.jpeg,.jpe,.gif,.bmp,.webp,.tif,.tiff,.heic,.heif,.avif,.svg";

const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp|tiff?|heic|heif|avif|svg)$/i;

export function isPdfFile(file: File): boolean {
  const t = (file.type ?? "").toLowerCase();
  if (t === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

export function isSupportedDocumentFile(file: File): boolean {
  const t = (file.type ?? "").toLowerCase();
  if (isPdfFile(file)) return true;
  if (t.startsWith("image/")) return true;
  if (t === "application/octet-stream" || t === "") {
    return IMAGE_EXT.test(file.name) || isPdfFile(file);
  }
  return IMAGE_EXT.test(file.name);
}

export function assertSupportedDocumentFile(file: File): void {
  if (!isSupportedDocumentFile(file)) {
    throw new Error("Desteklenmeyen dosya. Görsel (JPG, PNG, HEIC, …) veya PDF yükleyin.");
  }
}
