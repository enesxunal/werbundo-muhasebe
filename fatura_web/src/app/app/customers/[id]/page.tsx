"use client";

import { use, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";

type Customer = {
  id: string;
  name: string;
  tax_no: string | null;
  tax_office: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  issue_date: string;
  total: number;
  currency: string;
  created_at: string;
};

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    tax_no: "",
    tax_office: "",
    email: "",
    phone: "",
    address: "",
  });

  async function load() {
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik.");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select("id,name,tax_no,tax_office,email,phone,address,created_at")
        .eq("id", id)
        .single();
      if (cErr) throw cErr;
      const cust = c as Customer;
      setCustomer(cust);
      setForm({
        name: cust.name ?? "",
        tax_no: cust.tax_no ?? "",
        tax_office: cust.tax_office ?? "",
        email: cust.email ?? "",
        phone: cust.phone ?? "",
        address: cust.address ?? "",
      });

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id,issue_date,total,currency,created_at")
        .eq("customer_id", id)
        .order("issue_date", { ascending: false });
      if (invErr) throw invErr;
      setInvoices((inv ?? []) as InvoiceRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik.");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const { error: upErr } = await supabase
        .from("customers")
        .update({
          name: form.name.trim(),
          tax_no: form.tax_no.trim() || null,
          tax_office: form.tax_office.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
        })
        .eq("id", id);
      if (upErr) throw upErr;

      setOk("Kaydedildi.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-zinc-600">Yükleniyor...</div>;
  if (!customer) return <div className="text-sm text-zinc-600">Müşteri bulunamadı.</div>;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          <p className="mt-2 text-sm text-zinc-600">Müşteri bilgilerini düzenle ve faturaları gör.</p>
        </div>
        <a className="rounded-xl border bg-white px-4 py-2 text-sm" href="/app/customers">
          Geri
        </a>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Bilgiler</h2>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="mt-3 text-sm text-emerald-700">{ok}</p> : null}

          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-sm font-medium">Müşteri Adı</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Vergi No</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                  value={form.tax_no}
                  onChange={(e) => setForm({ ...form, tax_no: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Vergi Dairesi</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                  value={form.tax_office}
                  onChange={(e) => setForm({ ...form, tax_office: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Telefon</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Adres</label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white">
          <div className="border-b px-5 py-3 text-sm font-medium">Faturalar</div>
          <div className="divide-y">
            {invoices.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-600">Henüz fatura yok.</div>
            ) : (
              invoices.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="text-sm">{new Date(r.issue_date).toLocaleDateString("tr-TR")}</div>
                  <div className="text-sm font-semibold">
                    {r.total} {r.currency}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

