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

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export default function InvoicesListPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<"issue_date" | "created_at" | "total">("issue_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Faturalar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.issue_date) set.add(monthKey(r.issue_date));
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...rows];

    if (monthFilter) {
      list = list.filter((r) => r.issue_date && monthKey(r.issue_date) === monthFilter);
    }
    if (dateFrom) {
      list = list.filter((r) => r.issue_date >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((r) => r.issue_date <= dateTo);
    }

    list.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "total") {
        av = a.total;
        bv = b.total;
      } else if (sortKey === "created_at") {
        av = a.created_at;
        bv = b.created_at;
      } else {
        av = a.issue_date;
        bv = b.issue_date;
      }
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [rows, monthFilter, sortKey, sortDir, dateFrom, dateTo]);

  async function openDocument(row: InvoiceRow) {
    if (!row.document?.storage_path) return;
    try {
      const signedUrl = await getSignedDocumentUrl({
        bucket: row.document.storage_bucket || "documents",
        path: row.document.storage_path,
        expiresInSeconds: 120,
      });
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Dosya açılamadı.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">Faturalar</h1>
          <p className="mt-2 text-sm text-zinc-600">Tüm gelen faturalar; tarih ve tutara göre süzebilirsin.</p>
        </div>
        <a
          className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--app-navy-muted)]"
          href="/app/invoices/new"
        >
          + Manuel ekle
        </a>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 grid gap-3 rounded-2xl border border-[var(--app-border)] bg-white p-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs font-medium text-zinc-600">Fatura ayı</label>
          <select
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="">Tümü</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">Sırala</label>
          <select
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [typeof sortKey, typeof sortDir];
              setSortKey(k);
              setSortDir(d);
            }}
          >
            <option value="issue_date:desc">Fatura tarihi (yeni)</option>
            <option value="issue_date:asc">Fatura tarihi (eski)</option>
            <option value="created_at:desc">Yükleme zamanı (yeni)</option>
            <option value="created_at:asc">Yükleme zamanı (eski)</option>
            <option value="total:desc">Tutar (yüksek)</option>
            <option value="total:asc">Tutar (düşük)</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">Başlangıç (fatura tarihi)</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">Bitiş (fatura tarihi)</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-white">
        <div className="border-b border-[var(--app-border)] px-5 py-3 text-sm font-medium">
          Liste ({filtered.length}
          {filtered.length !== rows.length ? ` / ${rows.length}` : ""})
        </div>
        <div className="divide-y divide-[var(--app-border)]">
          {loading ? (
            <div className="px-5 py-4 text-sm text-zinc-600">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-600">Kayıt yok veya filtreye uymuyor.</div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">
                    {r.customer?.name ?? "Tedarikçi"} · {new Date(r.issue_date).toLocaleDateString("de-DE")}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {r.invoice_no ? `No: ${r.invoice_no}` : "No: —"}
                    {r.vat_total != null ? ` · USt/KDV: ${r.vat_total} ${r.currency}` : ""}
                    <span className="ml-2 text-zinc-400">
                      Yükleme: {new Date(r.created_at).toLocaleString("de-DE")}
                    </span>
                  </div>
                  {r.notes ? <div className="mt-2 text-sm text-zinc-700">{r.notes}</div> : null}
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <div className="text-sm font-semibold">
                    {r.total} {r.currency}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="rounded-lg border border-[var(--app-border)] bg-white px-3 py-1 text-xs hover:bg-slate-50"
                      href={`/app/invoices/${r.id}`}
                    >
                      Düzenle
                    </a>
                    {r.document ? (
                      <button
                        className="rounded-lg border border-[var(--app-border)] px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => openDocument(r)}
                        type="button"
                      >
                        Görsel
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-400">Dosya yok</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
