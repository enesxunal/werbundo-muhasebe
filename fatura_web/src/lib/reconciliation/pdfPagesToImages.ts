/** Sparkasse PDF hesap özeti — tüm sayfaları vision için JPEG base64'e çevirir */
export async function pdfPagesToImages(
  file: File,
  maxPages = 20,
): Promise<Array<{ mimeType: "image/jpeg"; base64: string }>> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const out: Array<{ mimeType: "image/jpeg"; base64: string }> = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const baseVp = page.getViewport({ scale: 1 });
    const maxW = 1100;
    const scale = baseVp.width > maxW ? maxW / baseVp.width : 1.4;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    let quality = 0.72;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 1_200_000 && quality > 0.45) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    const comma = dataUrl.indexOf(",");
    if (comma < 0) continue;
    const b64 = dataUrl.slice(comma + 1);
    if (b64.length > 1_500_000) continue;
    out.push({ mimeType: "image/jpeg", base64: b64 });
  }

  return out;
}
