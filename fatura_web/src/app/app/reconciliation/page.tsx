"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { uploadDocument } from "@/lib/upload/documents";
import { pdfPagesToImages } from "@/lib/reconciliation/pdfPagesToImages";
import type { ReconciliationResult } from "@/lib/reconciliation/types";
import { useI18n } from "@/lib/i18n/LocaleContext";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function ReconciliationPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2];
  }, [now]);

  const loadSaved = useCallback(async () => {
    if (!supabase) return;
    setLoadingSaved(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) return;

      const { data: rec, error: recErr } = await supabase
        .from("month_reconciliations")
        .select(
          "id, period_year, period_month, status, bank_txn_count, matched_count, missing_count, ai_summary",
        )
        .eq("period_year", year)
        .eq("period_month", month)
        .maybeSingle();

      if (recErr) throw recErr;
      if (!rec) {
        setResult(null);
        return;
      }

      const { data: txns, error: txnErr } = await supabase
        .from("bank_transactions")
        .select(
          "id, line_index, txn_date, amount, currency, counterparty, description, match_status, invoice_id, match_confidence, match_note, invoice:invoices(customer:customers(name))",
        )
        .eq("reconciliation_id", rec.id)
        .order("line_index", { ascending: true });

      if (txnErr) throw txnErr;

      setResult({
        reconciliationId: rec.id,
        periodYear: rec.period_year,
        periodMonth: rec.period_month,
        status: rec.status as "draft" | "completed",
        bankTxnCount: rec.bank_txn_count,
        matchedCount: rec.matched_count,
        missingCount: rec.missing_count,
        aiSummary: rec.ai_summary,
        transactions: (txns ?? []).map((row) => {
          const inv = row.invoice as
            | { customer?: { name?: string } | Array<{ name?: string }> }
            | null;
          const c = inv?.customer;
          const supplierName = Array.isArray(c) ? c[0]?.name : c?.name;
          return {
            id: String(row.id),
            lineIndex: row.line_index,
            txnDate: row.txn_date ? String(row.txn_date) : null,
            amount: Number(row.amount),
            currency: String(row.currency),
            counterparty: row.counterparty,
            description: row.description,
            matchStatus: row.match_status as "matched" | "missing_invoice",
            invoiceId: row.invoice_id,
            matchConfidence: row.match_confidence != null ? Number(row.match_confidence) : null,
            matchNote: row.match_note,
            supplierName: supplierName ?? null,
          };
        }),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoadingSaved(false);
    }
  }, [supabase, year, month, t]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  async function authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (supabase) {
      await supabase.auth.refreshSession();
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async function runAnalyze() {
    if (!file || !supabase) {
      setError(t("reconciliation.needFile"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error(t("assistant.needLogin"));

      const pages = await pdfPagesToImages(file);
      if (!pages.length) throw new Error(t("reconciliation.pdfFail"));

      const doc = await uploadDocument({
        file,
        userId: userData.user.id,
        docType: "bank_statement",
      });

      const res = await fetch("/api/reconciliation/analyze", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          locale,
          periodYear: year,
          periodMonth: month,
          pages,
          documentId: doc.id,
        }),
      });

      const json = (await res.json()) as { ok?: boolean; data?: ReconciliationResult; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? t("reconciliation.analyzeFail"));
      }
      setResult(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reconciliation/complete", {
        method: "POST",
        headers: await authHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ reconciliationId: result.reconciliationId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (json.error === "HAS_MISSING") throw new Error(t("reconciliation.cannotComplete"));
        throw new Error(json.error ?? t("common.error"));
      }
      setResult({ ...result, status: "completed" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const missing = result?.transactions.filter((x) => x.matchStatus === "missing_invoice") ?? [];
  const matched = result?.transactions.filter((x) => x.matchStatus === "matched") ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("reconciliation.title")}</h1>
      <p className="mt-2 text-sm text-zinc-600">{t("reconciliation.intro")}</p>

      <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--app-border)] bg-white p-6">
        <div className="flex flex-wrap gap-4">
          <label className="text-sm">
            <span className="font-medium">{t("reconciliation.month")}</span>
            <select
              className="mt-1 block rounded-lg border px-3 py-2"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">{t("reconciliation.year")}</span>
            <select
              className="mt-1 block rounded-lg border px-3 py-2"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm font-medium">
          {t("reconciliation.statementLabel")}
          <input
            type="file"
            accept="application/pdf"
            className="mt-1 block w-full rounded-xl border px-3 py-2"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="text-xs text-zinc-500">{t("reconciliation.statementHint")}</p>

        <button
          type="button"
          disabled={busy || !file}
          onClick={() => void runAnalyze()}
          className="w-fit rounded-xl bg-[var(--app-navy)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? t("reconciliation.analyzing") : t("reconciliation.analyzeBtn")}
        </button>

        {loadingSaved ? <p className="text-xs text-zinc-500">{t("common.loading")}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      {result ? (
        <div className="mt-6 space-y-4">
          <div
            className={`rounded-2xl border p-5 ${
              result.status === "completed"
                ? "border-emerald-300 bg-emerald-50"
                : result.missingCount > 0
                  ? "border-amber-300 bg-amber-50"
                  : "border-[var(--app-border)] bg-white"
            }`}
          >
            <p className="font-semibold text-[var(--app-navy)]">
              {result.status === "completed"
                ? t("reconciliation.completed", { month: String(result.periodMonth), year: String(result.periodYear) })
                : t("reconciliation.summaryTitle", {
                    month: String(result.periodMonth),
                    year: String(result.periodYear),
                  })}
            </p>
            <p className="mt-2 text-sm">
              {t("reconciliation.stats", {
                bank: String(result.bankTxnCount),
                matched: String(result.matchedCount),
                missing: String(result.missingCount),
              })}
            </p>
            {result.aiSummary ? <p className="mt-2 text-sm text-zinc-700">{result.aiSummary}</p> : null}
            {result.status === "draft" && result.missingCount === 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void markComplete()}
                className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
              >
                {t("reconciliation.markComplete")}
              </button>
            ) : null}
          </div>

          {missing.length > 0 ? (
            <section className="rounded-2xl border border-red-200 bg-white p-5">
              <h2 className="font-semibold text-red-800">{t("reconciliation.missingTitle")}</h2>
              <ul className="mt-3 space-y-3">
                {missing.map((row) => (
                  <li key={row.id} className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-sm">
                    <p className="font-medium">
                      {row.txnDate ?? "—"} · {row.amount.toFixed(2)} {row.currency}
                    </p>
                    <p className="mt-1 text-zinc-800">{row.counterparty ?? row.description ?? "—"}</p>
                    {row.description && row.counterparty ? (
                      <p className="mt-1 text-xs text-zinc-600">{row.description}</p>
                    ) : null}
                    <p className="mt-2 text-red-700">{t("reconciliation.missingLine")}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {matched.length > 0 ? (
            <section className="rounded-2xl border border-[var(--app-border)] bg-white p-5">
              <h2 className="font-semibold text-emerald-800">{t("reconciliation.matchedTitle")}</h2>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
                {matched.map((row) => (
                  <li key={row.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-100 py-2">
                    <span>
                      {row.txnDate} · {row.counterparty ?? "—"}
                    </span>
                    <span className="text-emerald-800">
                      {row.amount.toFixed(2)} {row.currency}
                      {row.supplierName ? ` → ${row.supplierName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Link href="/app/invoices" className="text-sm text-[var(--app-navy)] underline">
            {t("reconciliation.goInvoices")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

