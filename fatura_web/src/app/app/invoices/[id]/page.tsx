"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { isMissingPaidAtColumnError, postgrestErrorMessage } from "@/lib/supabase/postgrestError";
import { useI18n } from "@/lib/i18n/LocaleContext";

type CustomerRow = { id: string; name: string };

type ItemRow = {
  line_no: number | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
};

type InvoiceDbRow = {
  customer_id: string;
  issue_date: string;
  invoice_no: string | null;
  currency: string;
  subtotal: number | null;
  vat_total: number | null;
  total: number;
  notes: string | null;
  paid_at?: string | null;
};

type LineDbRow = {
  line_no: number | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
};

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = String(params.id ?? "");
  const { t } = useI18n();

  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [paid, setPaid] = useState(false);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [subtotal, setSubtotal] = useState("");
  const [vatTotal, setVatTotal] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toNumberOrNull(v: string) {
    const cleaned = v.replace(",", ".").trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function numToStr(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(Number(n))) return "";
    return Number(n).toFixed(2);
  }

  useEffect(() => {
    if (!invoiceId) return;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        if (!supabase) throw new Error("Supabase ayarları eksik.");
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          window.location.href = "/login";
          return;
        }
        const uid = userData.user.id;

        const { data: custList, error: cErr } = await supabase.from("customers").select("id,name").order("name", { ascending: true });
        if (cErr) throw cErr;
        setCustomers((custList ?? []) as CustomerRow[]);

        let invRes = await supabase
          .from("invoices")
          .select("id,customer_id,issue_date,invoice_no,currency,subtotal,vat_total,total,notes,paid_at")
          .eq("id", invoiceId)
          .eq("user_id", uid)
          .single();

        if (invRes.error && isMissingPaidAtColumnError(invRes.error)) {
          invRes = await supabase
            .from("invoices")
            .select("id,customer_id,issue_date,invoice_no,currency,subtotal,vat_total,total,notes")
            .eq("id", invoiceId)
            .eq("user_id", uid)
            .single();
        }

        const invErr = invRes.error;
        const inv = invRes.data;
        if (invErr) throw invErr;
        if (!inv) throw new Error("Fatura bulunamadı.");

        const row = inv as InvoiceDbRow;
        setCustomerId(String(row.customer_id ?? ""));
        setIssueDate(String(row.issue_date ?? "").slice(0, 10));
        setInvoiceNo(row.invoice_no ?? "");
        setCurrency(row.currency ?? "TRY");
        setSubtotal(numToStr(row.subtotal));
        setVatTotal(numToStr(row.vat_total));
        setTotal(numToStr(row.total));
        setNotes(row.notes ?? "");
        setPaid(Boolean(row.paid_at));

        const { data: lines, error: liErr } = await supabase
          .from("invoice_items")
          .select("line_no,description,quantity,unit,unit_price,line_total")
          .eq("invoice_id", invoiceId)
          .eq("user_id", uid)
          .order("line_no", { ascending: true });
        if (liErr) throw liErr;

        setItems(
          (lines ?? []).map((it) => {
            const li = it as LineDbRow;
            return {
              line_no: typeof li.line_no === "number" ? li.line_no : null,
              description: String(li.description ?? ""),
              quantity: li.quantity != null ? String(li.quantity) : "",
              unit: String(li.unit ?? ""),
              unitPrice: numToStr(li.unit_price),
              lineTotal: numToStr(li.line_total),
            };
          }),
        );
      } catch (err: unknown) {
        setError(postgrestErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId, supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik.");
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }
      if (!customerId) throw new Error(t("invoiceEdit.needCounterparty"));
      if (!issueDate) throw new Error("Tarih gerekli.");
      const totalNum = toNumberOrNull(total);
      if (totalNum == null) throw new Error("Toplam tutar geçersiz.");

      const subNum = toNumberOrNull(subtotal);
      const vatNum = toNumberOrNull(vatTotal);

      const { error: upErr } = await supabase
        .from("invoices")
        .update({
          customer_id: customerId,
          invoice_no: invoiceNo.trim() || null,
          issue_date: issueDate,
          currency: currency.trim() || "TRY",
          subtotal: subNum != null ? Number(subNum.toFixed(2)) : null,
          vat_total: vatNum != null ? Number(vatNum.toFixed(2)) : null,
          total: Number(totalNum.toFixed(2)),
          notes: notes.trim() || null,
          paid_at: paid ? new Date().toISOString() : null,
        })
        .eq("id", invoiceId)
        .eq("user_id", user.id);
      if (upErr) throw upErr;

      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId).eq("user_id", user.id);
      if (delErr) throw delErr;

      const rows = items
        .filter((it) => it.description.trim())
        .map((it, idx) => ({
          user_id: user.id,
          invoice_id: invoiceId,
          line_no: it.line_no ?? idx + 1,
          description: it.description.trim(),
          quantity: toNumberOrNull(it.quantity),
          unit: it.unit.trim() || null,
          unit_price: toNumberOrNull(it.unitPrice) != null ? Number((toNumberOrNull(it.unitPrice) as number).toFixed(2)) : null,
          line_total: toNumberOrNull(it.lineTotal) != null ? Number((toNumberOrNull(it.lineTotal) as number).toFixed(2)) : null,
        }));

      if (rows.length) {
        const { error: insErr } = await supabase.from("invoice_items").insert(rows);
        if (insErr) throw insErr;
      }

      router.push("/app/invoices");
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
          <h1 className="text-2xl font-semibold tracking-tight">Fatura Düzenle</h1>
          <p className="mt-2 text-sm text-zinc-600">Yanlışlık varsa düzeltip kaydet. Kalemler tamamen yeniden yazılır.</p>
        </div>
        <Link className="rounded-xl border bg-white px-4 py-2 text-sm" href="/app/invoices">
          Listeye dön
        </Link>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <form onSubmit={save} className="mt-6 grid max-w-3xl gap-4 rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            {t("invoiceEdit.markPaid")}
          </label>
        </div>

        <div>
          <label className="text-sm font-medium">{t("invoiceEdit.supplier")}</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
          >
            <option value="">Seç…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Tarih</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Fatura No</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-sm font-medium">Para birimi</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="TRY">TRY</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Ara toplam</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">USt / KDV</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={vatTotal}
              onChange={(e) => setVatTotal(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Toplam</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Not</label>
          <textarea
            className="mt-1 min-h-[72px] w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="rounded-2xl border overflow-x-auto">
          <div className="border-b px-4 py-2 text-sm font-medium">Kalemler</div>
          <div className="min-w-[760px] divide-y">
            {items.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-600">Kalem yok (isteğe bağlı ekleyebilirsin).</div>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-2 bg-zinc-50 px-4 py-2 text-[11px] font-medium text-zinc-600">
                  <div className="col-span-1">Pos.</div>
                  <div className="col-span-3">Bezeichnung</div>
                  <div className="col-span-1 text-right">Menge</div>
                  <div className="col-span-1">Einh.</div>
                  <div className="col-span-2 text-right">Einzel</div>
                  <div className="col-span-2 text-right">Gesamt</div>
                  <div className="col-span-2" />
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-3">
                    <div className="col-span-1">
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm outline-none focus:ring"
                        value={it.line_no != null ? String(it.line_no) : String(idx + 1)}
                        onChange={(e) => {
                          const n = [...items];
                          const v = Number(e.target.value.replace(",", "."));
                          n[idx] = { ...it, line_no: Number.isFinite(v) ? v : null };
                          setItems(n);
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
                        value={it.description}
                        onChange={(e) => {
                          const n = [...items];
                          n[idx] = { ...it, description: e.target.value };
                          setItems(n);
                        }}
                        placeholder="Açıklama"
                      />
                    </div>
                    <div className="col-span-1">
                      <input
                        className="w-full rounded-xl border px-2 py-2 text-sm outline-none focus:ring text-right"
                        value={it.quantity}
                        onChange={(e) => {
                          const n = [...items];
                          n[idx] = { ...it, quantity: e.target.value };
                          setItems(n);
                        }}
                        placeholder="Adet"
                      />
                    </div>
                    <div className="col-span-1">
                      <input
                        className="w-full rounded-xl border px-2 py-2 text-sm outline-none focus:ring"
                        value={it.unit}
                        onChange={(e) => {
                          const n = [...items];
                          n[idx] = { ...it, unit: e.target.value };
                          setItems(n);
                        }}
                        placeholder="Stk"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring text-right"
                        value={it.unitPrice}
                        onChange={(e) => {
                          const n = [...items];
                          n[idx] = { ...it, unitPrice: e.target.value };
                          setItems(n);
                        }}
                        placeholder="Birim"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring text-right"
                        value={it.lineTotal}
                        onChange={(e) => {
                          const n = [...items];
                          n[idx] = { ...it, lineTotal: e.target.value };
                          setItems(n);
                        }}
                        placeholder="Satır"
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="border-t px-4 py-3">
            <button
              type="button"
              className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-zinc-50"
              onClick={() => setItems([...items, { line_no: null, description: "", quantity: "", unit: "", unitPrice: "", lineTotal: "" }])}
            >
              + Kalem ekle
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-black px-5 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <Link className="rounded-xl border px-5 py-2 text-sm" href="/app/invoices">
            İptal
          </Link>
        </div>
      </form>
    </div>
  );
}
