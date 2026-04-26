"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { getSignedDocumentUrl } from "@/lib/upload/documents";

type InvoiceRow = {
  id: string;
  issue_date: string;
  invoice_no: string | null;
  currency: string;
  subtotal: number | null;
  vat_total: number | null;
  total: number;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
  document: { id: string; storage_bucket: string; storage_path: string; original_filename: string | null } | null;
};

export default function InvoicesListPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("invoices")
        .select(
          `
          id,issue_date,invoice_no,currency,subtotal,vat_total,total,notes,created_at,
          customer:customers(id,name),
          document:documents(id,storage_bucket,storage_path,original_filename)
        `,
        )
        .order("issue_date", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as unknown as InvoiceRow[]);
    } catch (err: any) {
      setError(err?.message ?? "Faturalar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDocument(row: InvoiceRow) {
    if (!row.document?.storage_path) return;
    try {
      const signedUrl = await getSignedDocumentUrl({
        bucket: row.document.storage_bucket || "documents",
        path: row.document.storage_path,
        expiresInSeconds: 60,
      });
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      alert(err?.message ?? "Dosya açılamadı.");
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faturalar</h1>
          <p className="mt-2 text-sm text-zinc-600">Fatura ekle, dosya yükle ve listele.</p>
        </div>
        <a className="rounded-xl bg-black px-4 py-2 text-sm text-white" href="/app/invoices/new">
          + Fatura Ekle
        </a>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 rounded-2xl border bg-white">
        <div className="border-b px-5 py-3 text-sm font-medium">Liste</div>
        <div className="divide-y">
          {loading ? (
            <div className="px-5 py-4 text-sm text-zinc-600">Yükleniyor...</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-600">Henüz fatura yok.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <div className="font-medium">
                    {r.customer?.name ?? "Müşteri"} · {new Date(r.issue_date).toLocaleDateString("tr-TR")}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {r.invoice_no ? `Fatura No: ${r.invoice_no}` : "Fatura No: —"}
                    {r.vat_total != null ? ` · KDV: ${r.vat_total} ${r.currency}` : ""}
                  </div>
                  {r.notes ? <div className="mt-2 text-sm text-zinc-700">{r.notes}</div> : null}
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                  <div className="text-sm font-semibold">
                    {r.total} {r.currency}
                  </div>
                  <a
                    className="rounded-lg border bg-white px-3 py-1 text-xs hover:bg-zinc-50"
                    href={`/app/invoices/${r.id}`}
                  >
                    Düzenle
                  </a>
                  {r.document ? (
                    <button
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-zinc-50"
                      onClick={() => openDocument(r)}
                      type="button"
                    >
                      Dosyayı Aç
                    </button>
                  ) : (
                    <div className="text-xs text-zinc-400">Dosya yok</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

