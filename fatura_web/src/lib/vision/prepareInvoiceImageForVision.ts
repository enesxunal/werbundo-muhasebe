import { resolveImageMimeFromFile } from "@/lib/vision/resolveImageMime";

/**
 * Fatura fotoğrafını API gövdesine uygun küçük JPEG'e çevirir (vision + OCR birlikte).
 * HEIC/HEIF tarayıcıda decode edilemeyebilir → null döner (sadece OCR metniyle devam).
 */
export async function prepareInvoiceImageForVision(
  file: File,
): Promise<{ imageBase64: string; mimeType: "image/jpeg" } | null> {
  const resolved = resolveImageMimeFromFile(file);
  if (!resolved || resolved === "image/heic" || resolved === "image/heif") return null;

  try {
    const bmp =
      file.type?.toLowerCase().startsWith("image/") && file.type !== "application/octet-stream"
        ? await createImageBitmap(file)
        : await createImageBitmap(new Blob([await file.arrayBuffer()], { type: resolved }));
    const maxW = 1280;
    let w = bmp.width;
    let h = bmp.height;
    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();

    let quality = 0.82;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 2_200_000 && quality > 0.45) {
      quality -= 0.07;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const b64 = dataUrl.slice(comma + 1);
    if (b64.length > 2_400_000) return null;

    return { imageBase64: b64, mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}
