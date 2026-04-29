"use client";

import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { getSignedDocumentUrl } from "@/lib/upload/documents";
import { useI18n } from "@/lib/i18n/LocaleContext";

type Customer = {
  id: string;
  name: string;
  tax_no: string | null;
  tax_office: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  counterparty_kind: "company" | "government" | "other" | null;
};

type InvoiceRow = {
  id: string;
  issue_date: string;
  invoice_no: string | null;
  total: number;
  currency: string;
  created_at: string;
  document_id: string | null;
};

const PAGE_SIZE = 8;

function domainFromEmails(emailStr: string | null): string | null {
  if (!emailStr?.trim()) return null;
  const first = emailStr.split(/[;,]/)[0]?.trim();
  const at = first?.indexOf("@");
  if (at === -1 || at === first.length - 1) return null;
  return first.slice(at + 1).toLowerCase();
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const [monthFilter, setMonthFilter] = useState("");
  const [page, setPage] = useState(0);

  const [form, setForm] = useState({
    name: "",
    counterparty_kind: "company" as "company" | "government" | "other",
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
        .select("id,name,tax_no,tax_office,email,phone,address,created_at,counterparty_kind")
        .eq("id", id)
        .single();
      if (cErr) throw cErr;
      const cust = c as Customer;
      setCustomer(cust);
      setLogoFailed(false);
      const k = cust.counterparty_kind;
      setForm({
        name: cust.name ?? "",
        counterparty_kind: k === "government" || k === "other" ? k : "company",
        tax_no: cust.tax_no ?? "",
        tax_office: cust.tax_office ?? "",
        email: cust.email ?? "",
        phone: cust.phone ?? "",
        address: cust.address ?? "",
      });

      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("id,issue_date,invoice_no,total,currency,created_at,document_id")
        .eq("customer_id", id)
        .order("issue_date", { ascending: false });
      if (invErr) throw invErr;
      setInvoices((inv ?? []) as InvoiceRow[]);
      setPage(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const logoDomain = useMemo(() => domainFromEmails(form.email), [form.email]);
  const logoUrl = logoDomain ? `https://logo.clearbit.com/${encodeURIComponent(logoDomain)}` : null;

  const monthSpend = useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of invoices) {
      const k = monthKey(inv.issue_date);
      m.set(k, (m.get(k) ?? 0) + Number(inv.total));
    }
    return Array.from(m.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 8);
  }, [invoices]);

  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    for (const inv of invoices) s.add(monthKey(inv.issue_date));
    return Array.from(s).sort((a, b) => (a < b ? 1 : -1));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    if (!monthFilter) return invoices;
    return invoices.filter((i) => monthKey(i.issue_date) === monthFilter);
  }, [invoices, monthFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredInvoices.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
          counterparty_kind: form.counterparty_kind,
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function openInvoiceScan(inv: InvoiceRow) {
    if (!inv.document_id || !supabase) return;
    try {
      const { data: doc, error } = await supabase
        .from("documents")
        .select("storage_bucket,storage_path")
        .eq("id", inv.document_id)
        .single();
      if (error || !doc) throw new Error("Dosya bulunamadı.");
      const row = doc as { storage_bucket: string; storage_path: string };
      const url = await getSignedDocumentUrl({
        bucket: row.storage_bucket || "documents",
        path: row.storage_path,
        expiresInSeconds: 120,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Açılamadı.");
    }
  }

  if (loading) return <div className="text-sm text-zinc-600">Yükleniyor...</div>;
  if (!customer) return <div className="text-sm text-zinc-600">{t("customerDetail.notFound")}</div>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          {logoUrl && !logoFailed ? (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[var(--app-border)] bg-white">
              <Image
                src={logoUrl}
                alt=""
                fill
                className="object-contain p-1"
                unoptimized
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{customer.name}</h1>
            <p className="mt-2 text-sm text-zinc-600">{t("customers.subtitle")}</p>
          </div>
        </div>
        <Link className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm" href="/app/customers">
          Liste
        </Link>
      </div>

      {monthSpend.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthSpend.map(([mk, total]) => (
            <div key={mk} className="rounded-2xl border border-[var(--app-border)] bg-white px-4 py-3">
              <p className="text-xs text-zinc-500">{mk}</p>
              <p className="mt-1 text-lg font-semibold text-[var(--app-navy)]">
                {total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                {invoices[0]?.currency ?? "EUR"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-[var(--app-navy)]">Bilgiler</h2>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="mt-3 text-sm text-emerald-700">{ok}</p> : null}

          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-sm font-medium">{t("customerDetail.kind")}</label>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                value={form.counterparty_kind}
                onChange={(e) =>
                  setForm({ ...form, counterparty_kind: e.target.value as "company" | "government" | "other" })
                }
              >
                <option value="company">{t("customerDetail.kindCompany")}</option>
                <option value="government">{t("customerDetail.kindGovernment")}</option>
                <option value="other">{t("customerDetail.kindOther")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("customerDetail.company")}</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">USt-IdNr / vergi no</label>
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                  value={form.tax_no}
                  onChange={(e) => setForm({ ...form, tax_no: e.target.value })}
                  placeholder="DE123456789"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Steuernummer</label>
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                  value={form.tax_office}
                  onChange={(e) => setForm({ ...form, tax_office: e.target.value })}
                  placeholder="224/5748/2276"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">E-posta (birden fazlaysa virgülle)</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Telefon</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Adres</label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--app-border)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-5 py-3">
            <span className="text-sm font-medium">Faturalar</span>
            <select
              className="rounded-lg border border-[var(--app-border)] px-2 py-1 text-xs outline-none"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">Tüm aylar</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-[var(--app-border)]">
            {pageRows.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-600">Kayıt yok.</div>
            ) : (
              pageRows.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium">{new Date(r.issue_date).toLocaleDateString("de-DE")}</div>
                    <div className="text-xs text-zinc-500">{r.invoice_no ?? "—"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {r.total} {r.currency}
                    </span>
                    <a
                      className="rounded-lg border border-[var(--app-border)] px-2 py-1 text-xs hover:bg-slate-50"
                      href={`/app/invoices/${r.id}`}
                    >
                      Düzenle
                    </a>
                    {r.document_id ? (
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--app-border)] px-2 py-1 text-xs hover:bg-slate-50"
                        onClick={() => openInvoiceScan(r)}
                      >
                        Görsel
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-[var(--app-border)] px-5 py-3 text-xs">
              <button
                type="button"
                className="rounded-lg border px-2 py-1 disabled:opacity-40"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Önceki
              </button>
              <span>
                Sayfa {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                className="rounded-lg border px-2 py-1 disabled:opacity-40"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Sonraki
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
