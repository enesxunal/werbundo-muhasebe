import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadDocument } from "@/lib/upload/documents";

export type UploadInvoiceItem = {
  lineNo?: number;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
};

export type UploadInvoiceDraft = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerTaxNo: string;
  customerTaxOffice: string;
  invoiceNo: string;
  issueDate: string;
  currency: "TRY" | "USD" | "EUR";
  subtotal: string;
  vatTotal: string;
  total: string;
  items: UploadInvoiceItem[];
};

function toNum(v: string): number | undefined {
  const cleaned = v.replace(",", ".").trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function isMissingColumnError(msg: string): boolean {
  return /could not find the .*column|schema cache|column .* does not exist|42703/i.test(msg);
}

/** Tablo yok / PostgREST şema önbelleği / PGRST205 vb. */
function isMissingTableOrRelationError(msg: string): boolean {
  return /could not find the table|schema cache|does not exist|relation .* does not exist|PGRST205|PGRST202/i.test(
    String(msg),
  );
}

function customerPatch(d: UploadInvoiceDraft) {
  return {
    tax_no: d.customerTaxNo.trim() || null,
    tax_office: d.customerTaxOffice.trim() || null,
    email: d.customerEmail.trim() || null,
    phone: d.customerPhone.trim() || null,
    address: d.customerAddress.trim() || null,
  };
}

async function updateCustomerDetails(
  supabase: SupabaseClient,
  userId: string,
  customerId: string,
  patch: ReturnType<typeof customerPatch>,
): Promise<void> {
  const attempts: Array<Partial<typeof patch>> = [
    patch,
    { tax_no: patch.tax_no, tax_office: patch.tax_office, email: patch.email, phone: patch.phone },
    { tax_no: patch.tax_no, tax_office: patch.tax_office },
    { email: patch.email, phone: patch.phone },
  ];
  for (const p of attempts) {
    const keys = Object.keys(p);
    if (!keys.length) continue;
    const { error } = await supabase.from("customers").update(p).eq("id", customerId).eq("user_id", userId);
    if (!error) return;
    if (!isMissingColumnError(String(error.message))) throw error;
  }
}

/**
 * Aynı isimde (boşluk normalize, büyük/küçük harf yok say) müşteri varsa onu kullanır; yoksa oluşturur.
 */
async function resolveCustomerId(supabase: SupabaseClient, userId: string, draft: UploadInvoiceDraft): Promise<string> {
  const nameKey = draft.customerName.replace(/\s+/g, " ").trim();
  if (!nameKey) throw new Error("Müşteri adı gerekli.");

  const { data: rows, error: findErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", nameKey)
    .limit(1);
  if (findErr) throw findErr;

  const existingId = rows?.[0]?.id as string | undefined;
  const patch = customerPatch(draft);

  if (existingId) {
    await updateCustomerDetails(supabase, userId, existingId, patch);
    return existingId;
  }

  const insertFull = { user_id: userId, name: nameKey, ...patch };
  let ins = await supabase.from("customers").insert(insertFull).select("id").single();
  if (ins.error && isMissingColumnError(String(ins.error.message))) {
    ins = await supabase.from("customers").insert({ user_id: userId, name: nameKey }).select("id").single();
  }
  if (ins.error) throw ins.error;
  return (ins.data as { id: string }).id;
}

export async function persistUploadDraft(args: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
  draft: UploadInvoiceDraft;
  aiApplied: boolean;
  aiConfidence: number | null;
}): Promise<void> {
  const { supabase, userId, file, draft, aiApplied, aiConfidence } = args;

  const totalNum = toNum(draft.total);
  if (typeof totalNum !== "number") throw new Error("Toplam tutar gerekli.");

  const customerId = await resolveCustomerId(supabase, userId, draft);
  const doc = await uploadDocument({ file, userId, docType: "invoice" });

  const subNum = toNum(draft.subtotal);
  const vatNum = toNum(draft.vatTotal);

  const invoiceBase = {
    user_id: userId,
    customer_id: customerId,
    document_id: doc.id,
    invoice_no: draft.invoiceNo.trim() || null,
    issue_date: draft.issueDate,
    currency: draft.currency,
    subtotal: typeof subNum === "number" ? Number(subNum.toFixed(2)) : null,
    vat_total: typeof vatNum === "number" ? Number(vatNum.toFixed(2)) : null,
    total: Number(totalNum.toFixed(2)),
    notes: aiApplied ? "Fotoğraftan otomatik kayıt (OCR + AI)." : "Fotoğraftan otomatik kayıt (OCR).",
  };

  const confidenceVal =
    typeof aiConfidence === "number" && Number.isFinite(aiConfidence)
      ? Number(aiConfidence.toFixed(2))
      : null;

  let { data: invRow, error: invErr } = await supabase
    .from("invoices")
    .insert({
      ...invoiceBase,
      confidence_total: confidenceVal,
    })
    .select("id")
    .single();

  if (invErr && isMissingColumnError(String(invErr.message))) {
    const r2 = await supabase.from("invoices").insert(invoiceBase).select("id").single();
    invRow = r2.data;
    invErr = r2.error;
  }
  if (invErr) throw invErr;
  const invoiceId = (invRow as { id: string } | null)?.id;
  if (!invoiceId) throw new Error("Fatura kaydı oluşturulamadı.");

  if (draft.items.length > 0) {
    const rows = draft.items
      .filter((it) => it.description?.trim())
      .map((it, idx) => ({
        user_id: userId,
        invoice_id: invoiceId,
        line_no: it.lineNo ?? idx + 1,
        description: it.description.trim(),
        quantity: typeof it.quantity === "number" ? it.quantity : null,
        unit: it.unit ?? null,
        unit_price: typeof it.unitPrice === "number" ? Number(it.unitPrice.toFixed(2)) : null,
        line_total: typeof it.lineTotal === "number" ? Number(it.lineTotal.toFixed(2)) : null,
      }));
    if (rows.length) {
      const { error: itErr } = await supabase.from("invoice_items").insert(rows);
      if (itErr) {
        const em = String(itErr.message ?? "");
        if (isMissingTableOrRelationError(em) && /invoice_items/i.test(em)) {
          await supabase.from("invoices").delete().eq("id", invoiceId).eq("user_id", userId);
          throw new Error(
            "Veritabanında 'invoice_items' tablosu veya RLS politikaları eksik. Bu yüzden fatura satırı geri alındı. Çözüm: Supabase SQL Editor'da projedeki `fatura_web/supabase/bootstrap_once.sql` dosyasının tamamını bir kez çalıştırın; ardından sayfayı yenileyip tekrar yükleyin.",
          );
        }
        throw itErr;
      }
    }
  }
}
