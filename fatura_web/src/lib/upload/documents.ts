import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";

export async function uploadDocument(args: {
  file: File;
  userId: string;
  docType: "invoice" | "payment_receipt" | "correspondence";
  /** Klasik tarama ile düzeltilmiş JPEG (AI değil) */
  processedBlob?: Blob | null;
}) {
  const supabase = createSupabaseBrowserClientSafe();
  if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
  const { file, userId, docType, processedBlob } = args;

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeExt = (ext || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const fileName = `${crypto.randomUUID()}.${safeExt}`;
  const storagePath = `${userId}/${docType}/${fileName}`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false, contentType: file.type || undefined });
  if (uploadErr) {
    const msg =
      uploadErr && typeof uploadErr === "object" && "message" in uploadErr
        ? String((uploadErr as { message: string }).message)
        : "Storage upload başarısız.";
    throw new Error(`Storage(Upload) RLS/izin hatası: ${msg}`);
  }

  let processedStoragePath: string | null = null;
  if (processedBlob) {
    processedStoragePath = `${userId}/${docType}/processed/${crypto.randomUUID()}.jpg`;
    const { error: procErr } = await supabase.storage
      .from("documents")
      .upload(processedStoragePath, processedBlob, { upsert: false, contentType: "image/jpeg" });
    if (procErr) {
      const msg =
        procErr && typeof procErr === "object" && "message" in procErr
          ? String((procErr as { message: string }).message)
          : "İşlenmiş görsel yüklenemedi.";
      throw new Error(`Storage(processed) hatası: ${msg}`);
    }
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    doc_type: docType,
    original_filename: file.name,
    storage_bucket: "documents",
    storage_path: storagePath,
    mime_type: file.type || null,
    size_bytes: file.size || null,
  };
  if (processedStoragePath) {
    row.processed_storage_path = processedStoragePath;
  }

  const { data: docRow, error: docErr } = await supabase
    .from("documents")
    .insert(row)
    .select("id,storage_bucket,storage_path,processed_storage_path")
    .single();

  if (docErr) {
    const msg =
      docErr && typeof docErr === "object" && "message" in docErr
        ? String((docErr as { message: string }).message)
        : "documents insert başarısız.";
    const hint = String(msg).includes("processed_storage_path")
      ? " Supabase SQL Editor'da `fatura_web/supabase/migration_documents_processed.sql` dosyasını bir kez çalıştırın."
      : "";
    throw new Error(`DB(documents) RLS/izin hatası: ${msg}${hint}`);
  }

  return docRow as {
    id: string;
    storage_bucket: string;
    storage_path: string;
    processed_storage_path: string | null;
  };
}

export async function getSignedDocumentUrl(args: {
  bucket?: string;
  path: string;
  expiresInSeconds?: number;
}) {
  const supabase = createSupabaseBrowserClientSafe();
  if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
  const { bucket = "documents", path, expiresInSeconds = 60 } = args;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
