import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";

export async function uploadDocument(args: {
  file: File;
  userId: string;
  docType: "invoice" | "payment_receipt" | "correspondence";
}) {
  const supabase = createSupabaseBrowserClientSafe();
  if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
  const { file, userId, docType } = args;

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeExt = (ext || "bin").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const fileName = `${crypto.randomUUID()}.${safeExt}`;
  const storagePath = `${userId}/${docType}/${fileName}`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false, contentType: file.type });
  if (uploadErr) {
    const msg =
      uploadErr && typeof uploadErr === "object" && "message" in uploadErr
        ? String((uploadErr as { message: string }).message)
        : "Storage upload başarısız.";
    throw new Error(`Storage(Upload) RLS/izin hatası: ${msg}`);
  }

  const { data: docRow, error: docErr } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      doc_type: docType,
      original_filename: file.name,
      storage_bucket: "documents",
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size || null,
    })
    .select("id,storage_bucket,storage_path")
    .single();

  if (docErr) {
    const msg =
      docErr && typeof docErr === "object" && "message" in docErr
        ? String((docErr as { message: string }).message)
        : "documents insert başarısız.";
    throw new Error(`DB(documents) RLS/izin hatası: ${msg}`);
  }

  return docRow as { id: string; storage_bucket: string; storage_path: string };
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

