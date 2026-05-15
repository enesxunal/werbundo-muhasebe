import { getSignedDocumentUrl } from "@/lib/upload/documents";

export type DocumentDownloadSource = {
  storage_bucket?: string | null;
  storage_path: string;
  processed_storage_path?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
};

function baseName(doc: DocumentDownloadSource): string {
  const n = doc.original_filename?.replace(/\.[^.]+$/, "") || "belge";
  return n.replace(/[^\w\u00C0-\u024F.-]+/g, "_").slice(0, 80) || "belge";
}

function isOriginalPdf(doc: DocumentDownloadSource): boolean {
  const t = (doc.mime_type ?? "").toLowerCase();
  if (t === "application/pdf") return true;
  return /\.pdf$/i.test(doc.original_filename ?? "") || /\.pdf$/i.test(doc.storage_path);
}

async function fetchBlobFromStorage(path: string, bucket?: string): Promise<Blob> {
  const url = await getSignedDocumentUrl({ path, bucket: bucket ?? "documents", expiresInSeconds: 120 });
  const res = await fetch(url);
  if (!res.ok) throw new Error("Dosya indirilemedi.");
  return res.blob();
}

/** Düzeltilmiş JPG (yoksa orijinal görsel) */
export async function downloadDocumentAsJpg(doc: DocumentDownloadSource): Promise<void> {
  const path = doc.processed_storage_path || doc.storage_path;
  const blob = await fetchBlobFromStorage(path, doc.storage_bucket ?? undefined);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${baseName(doc)}.jpg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** PDF: orijinal PDF varsa onu; yoksa işlenmiş JPG'den tek sayfa PDF üret */
export async function downloadDocumentAsPdf(doc: DocumentDownloadSource): Promise<void> {
  if (isOriginalPdf(doc) && !doc.processed_storage_path) {
    const blob = await fetchBlobFromStorage(doc.storage_path, doc.storage_bucket ?? undefined);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName(doc)}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }

  const path = doc.processed_storage_path || doc.storage_path;
  const blob = await fetchBlobFromStorage(path, doc.storage_bucket ?? undefined);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Görsel okunamadı."));
    r.readAsDataURL(blob);
  });

  const { jsPDF } = await import("jspdf");
  const img = document.createElement("img");
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = dataUrl;
  });

  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 1100;
  const orientation = w > h ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [w, h] });
  pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);
  pdf.save(`${baseName(doc)}.pdf`);
}
