/**
 * Windows / bazı kaynaklarda File.type boş veya application/octet-stream olabiliyor;
 * uzantıdan image/* tahmin eder (görüntü hazırlama + OCR için).
 */
export function resolveImageMimeFromFile(file: File): string | null {
  const t = (file.type ?? "").trim().toLowerCase();
  if (t.startsWith("image/") && t !== "image/heic" && t !== "image/heif") {
    return t === "image/jpg" ? "image/jpeg" : t;
  }
  if (t === "application/octet-stream" || t === "") {
    const n = file.name.toLowerCase();
    if (/\.(jpe?g)$/.test(n)) return "image/jpeg";
    if (/\.png$/.test(n)) return "image/png";
    if (/\.webp$/.test(n)) return "image/webp";
    if (/\.(heic|heif)$/.test(n)) return "image/heic";
  }
  return null;
}
