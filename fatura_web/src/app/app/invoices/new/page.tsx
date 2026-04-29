"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { uploadDocument } from "@/lib/upload/documents";
import { runInvoiceOcr } from "@/lib/ocr/runOcr";

type CustomerRow = { id: string; name: string };

export default function NewInvoicePage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState<string>("");
  const [currency, setCurrency] = useState<string>("TRY");
  const [subtotal, setSubtotal] = useState<string>("");
  const [vatRate, setVatRate] = useState<string>("20");
  const [vatTotal, setVatTotal] = useState<string>("");
  const [total, setTotal] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ status: string; progress: number } | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      setLoading(true);
      try {
        if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          window.location.href = "/login";
          return;
        }

        const { data, error } = await supabase.from("customers").select("id,name").order("name", { ascending: true });
        if (error) throw error;
        const list = (data ?? []) as CustomerRow[];
        setCustomers(list);
        if (!customerId && list[0]?.id) setCustomerId(list[0].id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Müşteriler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toNumberOrNull(v: string) {
    const cleaned = v.replace(",", ".").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function recalcFromSubtotal() {
    const sub = toNumberOrNull(subtotal);
    const rate = toNumberOrNull(vatRate) ?? 0;
    if (sub == null) return;
    const vat = (sub * rate) / 100;
    const tot = sub + vat;
    setVatTotal(vat.toFixed(2));
    setTotal(tot.toFixed(2));
  }

  async function ocrFill() {
    if (!file) {
      setError("Önce bir fotoğraf seçmelisin.");
      return;
    }
    setError(null);
    setOcrLoading(true);
    setOcrProgress({ status: "Başlıyor", progress: 0 });
    setOcrPreview(null);
    try {
      const { extracted, text } = await runInvoiceOcr({
        file,
        onProgress: (p) => setOcrProgress(p),
      });

      if (extracted.issueDateISO) setIssueDate(extracted.issueDateISO);
      if (extracted.currency) setCurrency(extracted.currency);
      if (typeof extracted.vatTotal === "number") setVatTotal(extracted.vatTotal.toFixed(2));
      if (typeof extracted.total === "number") setTotal(extracted.total.toFixed(2));

      // Toplam ve KDV varsa ara toplam hesapla (boşsa)
      const tot = extracted.total;
      const vat = extracted.vatTotal;
      if (typeof tot === "number" && typeof vat === "number") {
        const sub = tot - vat;
        if (Number.isFinite(sub) && sub >= 0 && !subtotal.trim()) setSubtotal(sub.toFixed(2));
      }

      setOcrPreview(text.slice(0, 800));
      setOcrProgress({ status: "Tamamlandı", progress: 1 });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OCR başarısız.");
      setOcrProgress(null);
    } finally {
      setOcrLoading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      if (!customerId) throw new Error("Müşteri seçmelisin.");
      if (!issueDate) throw new Error("Tarih zorunlu.");

      const totalNum = toNumberOrNull(total);
      if (totalNum == null) throw new Error("Toplam tutar geçersiz.");

      let documentId: string | null = null;
      if (file) {
        const doc = await uploadDocument({ file, userId: user.id, docType: "invoice" });
        documentId = doc.id;
      }

      const { error: insertErr } = await supabase.from("invoices").insert({
        user_id: user.id,
        customer_id: customerId,
        document_id: documentId,
        invoice_no: invoiceNo.trim() || null,
        issue_date: issueDate,
        currency: currency.trim() || "TRY",
        subtotal: toNumberOrNull(subtotal),
        vat_rate: toNumberOrNull(vatRate),
        vat_total: toNumberOrNull(vatTotal),
        total: totalNum,
        notes: notes.trim() || null,
      });
      if (insertErr) throw insertErr;

      window.location.href = "/app/invoices";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-600">Yükleniyor...</div>;
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fatura Ekle</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Telefondan çekilen fotoğraflar (JPG/PNG/WebP/HEIC) veya PDF yükleyebilir, tutarları girebilirsin.
          </p>
        </div>
        <Link className="rounded-xl border bg-white px-4 py-2 text-sm" href="/app/invoices">
          Geri
        </Link>
      </div>

      <form onSubmit={save} className="mt-6 grid gap-4 rounded-2xl border bg-white p-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Müşteri</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Müşteri yoksa önce{" "}
              <Link className="underline" href="/app/customers">
                Müşteriler
              </Link>{" "}
              ekranından ekle.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Tarih</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Fatura No (opsiyonel)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="Örn: INV-2026-001"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Para Birimi</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Dosya (opsiyonel)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              type="file"
              accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              iPhone bazen HEIC/HEIF gönderir; bu formatlar da desteklenir.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={ocrFill}
                disabled={!file || ocrLoading}
                className="rounded-lg bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                {ocrLoading ? "OCR çalışıyor..." : "OCR ile doldur"}
              </button>
              {ocrProgress ? (
                <span className="text-xs text-zinc-600">
                  {ocrProgress.status} · %{Math.round((ocrProgress.progress ?? 0) * 100)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {ocrPreview ? (
          <details className="rounded-xl border bg-zinc-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">OCR metni (kontrol için)</summary>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">{ocrPreview}</pre>
          </details>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Ara Toplam</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              placeholder="Örn: 1000,00"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-sm font-medium">KDV Oranı (%)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              placeholder="20"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-sm font-medium">KDV Tutarı</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={vatTotal}
              onChange={(e) => setVatTotal(e.target.value)}
              placeholder="Örn: 200,00"
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Toplam</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Örn: 1200,00"
              inputMode="decimal"
              required
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1 text-xs hover:bg-zinc-50"
                onClick={recalcFromSubtotal}
              >
                AraToplam+KDV’den hesapla
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Not</label>
            <textarea
              className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsiyonel açıklama"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            disabled={saving}
            className="rounded-xl bg-black px-5 py-2 text-sm text-white disabled:opacity-50"
            type="submit"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

