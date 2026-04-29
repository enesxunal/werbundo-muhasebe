"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { isMissingPaidAtColumnError, postgrestErrorMessage } from "@/lib/supabase/postgrestError";
import { getSignedDocumentUrl } from "@/lib/upload/documents";
import { useI18n } from "@/lib/i18n/LocaleContext";

const INVOICE_LIST_SELECT_WITH_PAID = `
          id,issue_date,invoice_no,currency,subtotal,vat_total,total,notes,created_at,paid_at,
          customer:customers(id,name),
          document:documents(id,storage_bucket,storage_path,original_filename)
        `;

const INVOICE_LIST_SELECT_LEGACY = `
          id,issue_date,invoice_no,currency,subtotal,vat_total,total,notes,created_at,
          customer:customers(id,name),
          document:documents(id,storage_bucket,storage_path,original_filename)
        `;

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
  paid_at: string | null;
  customer: { id: string; name: string } | null;
  document: { id: string; storage_bucket: string; storage_path: string; original_filename: string | null } | null;
};

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export default function InvoicesListPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [monthFilter, setMonthFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<"issue_date" | "created_at" | "total">("issue_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dateLoc = locale === "de" ? "de-DE" : "tr-TR";

  async function load() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      let fallbackWithoutPaidAt = false;
      const first = await supabase
        .from("invoices")
        .select(INVOICE_LIST_SELECT_WITH_PAID)
        .order("issue_date", { ascending: false });

      let data: unknown = first.data;
      let qErr = first.error;

      if (qErr && isMissingPaidAtColumnError(qErr)) {
        fallbackWithoutPaidAt = true;
        const second = await supabase
          .from("invoices")
          .select(INVOICE_LIST_SELECT_LEGACY)
          .order("issue_date", { ascending: false });
        data = second.data;
        qErr = second.error;
      }

      if (qErr) throw qErr;

      const raw = (data ?? []) as unknown as InvoiceRow[];
      setRows(
        fallbackWithoutPaidAt ? raw.map((r) => ({ ...r, paid_at: null })) : raw,
      );
    } catch (err: unknown) {
      setError(postgrestErrorMessage(err));
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
      alert(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function setInvoicePaid(id: string, paid: boolean) {
    if (!supabase) return;
    try {
      const { error: uErr } = await supabase
        .from("invoices")
        .update({ paid_at: paid ? new Date().toISOString() : null })
        .eq("id", id);
      if (uErr) throw uErr;
      await load();
    } catch {
      setError(t("common.error"));
    }
  }

  async function removeInvoice(id: string) {
    if (!supabase) return;
    if (!window.confirm(t("invoices.deleteConfirm"))) return;
    setDeletingId(id);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { error: delErr } = await supabase.from("invoices").delete().eq("id", id).eq("user_id", uid);
      if (delErr) throw delErr;
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("invoices.deleteErr"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("invoices.title")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("invoices.subtitle")}</p>
        </div>
        <Link
          className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--app-navy-muted)]"
          href="/app/invoices/new"
        >
          {t("invoices.addManual")}
        </Link>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 grid gap-3 rounded-2xl border border-[var(--app-border)] bg-white p-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs font-medium text-zinc-600">{t("invoices.filterMonth")}</label>
          <select
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="">{t("invoices.all")}</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">{t("invoices.sort")}</label>
          <select
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [typeof sortKey, typeof sortDir];
              setSortKey(k);
              setSortDir(d);
            }}
          >
            <option value="issue_date:desc">{t("invoices.sortIssueDesc")}</option>
            <option value="issue_date:asc">{t("invoices.sortIssueAsc")}</option>
            <option value="created_at:desc">{t("invoices.sortCreatedDesc")}</option>
            <option value="created_at:asc">{t("invoices.sortCreatedAsc")}</option>
            <option value="total:desc">{t("invoices.sortTotalDesc")}</option>
            <option value="total:asc">{t("invoices.sortTotalAsc")}</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">{t("invoices.dateFrom")}</label>
          <input
            type="date"
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-600">{t("invoices.dateTo")}</label>
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
          {t("invoices.list")} ({filtered.length}
          {filtered.length !== rows.length ? ` / ${rows.length}` : ""})
        </div>
        <div className="divide-y divide-[var(--app-border)]">
          {loading ? (
            <div className="px-5 py-4 text-sm text-zinc-600">{t("invoices.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-600">{t("invoices.empty")}</div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">
                    {r.customer?.name ?? t("invoices.supplier")} ·{" "}
                    {new Date(r.issue_date).toLocaleDateString(dateLoc)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {r.invoice_no ? `${t("upload.invoiceNo")}: ${r.invoice_no}` : t("invoices.noNum")}
                    {r.vat_total != null ? ` · ${t("upload.vat")}: ${r.vat_total} ${r.currency}` : ""}
                    {!r.paid_at ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">{t("invoices.unpaidHint")}</span>
                    ) : null}
                    <span className="ml-2 text-zinc-400">
                      {t("invoices.uploaded")}: {new Date(r.created_at).toLocaleString(dateLoc)}
                    </span>
                  </div>
                  {r.notes ? <div className="mt-2 text-sm text-zinc-700">{r.notes}</div> : null}
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <div className="text-sm font-semibold">
                    {r.total} {r.currency}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-white px-3 py-1 text-xs hover:bg-slate-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(r.paid_at)}
                        onChange={() => void setInvoicePaid(r.id, !r.paid_at)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {t("invoices.paid")}
                    </label>
                    <Link
                      className="rounded-lg border border-[var(--app-border)] bg-white px-3 py-1 text-xs hover:bg-slate-50"
                      href={`/app/invoices/${r.id}`}
                    >
                      {t("invoices.edit")}
                    </Link>
                    {r.document ? (
                      <button
                        className="rounded-lg border border-[var(--app-border)] px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => openDocument(r)}
                        type="button"
                      >
                        {t("invoices.image")}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-400">{t("invoices.noFile")}</span>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === r.id}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-800 hover:bg-red-100 disabled:opacity-50"
                      onClick={() => void removeInvoice(r.id)}
                    >
                      {deletingId === r.id ? "…" : t("invoices.delete")}
                    </button>
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
