import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseUserFromRequest } from "@/lib/supabase/authFromRequest";
import {
  dedupeBankTransactions,
  extractBankTransactionsFromPages,
} from "@/lib/reconciliation/extractBankStatement";
import { fetchInvoicesForMatching } from "@/lib/reconciliation/fetchInvoicesForMatching";
import { matchTransactionsToInvoices } from "@/lib/reconciliation/matchTransactions";
import type { ReconciliationResult } from "@/lib/reconciliation/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const pageSchema = z.object({
  mimeType: z.string(),
  base64: z.string().max(2_500_000),
});

const txnSchema = z.object({
  date: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string(),
  counterparty: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const bodySchema = z.object({
  locale: z.enum(["tr", "de"]).optional().default("tr"),
  periodYear: z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  pages: z.array(pageSchema).max(12).optional(),
  transactions: z.array(txnSchema).optional(),
  documentId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await getSupabaseUserFromRequest(req);
    if (!auth.ok) {
      const status = auth.error === "SUPABASE_ENV" ? 503 : 401;
      return NextResponse.json({ ok: false, error: auth.error }, { status });
    }

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
    }

    const { supabase, user } = auth;
    const { periodYear, periodMonth, pages, documentId, locale, transactions: prefetched } = parsed.data;
    const periodLabel = `${periodYear}-${String(periodMonth).padStart(2, "0")}`;

    let transactions = prefetched
      ? dedupeBankTransactions(
          prefetched.map((t) => ({
            date: t.date ?? null,
            amount: t.amount,
            currency: t.currency,
            counterparty: t.counterparty ?? null,
            description: t.description ?? null,
          })),
        )
      : [];

    if (!transactions.length) {
      if (!pages?.length) {
        return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
      }
      const extracted = await extractBankTransactionsFromPages(
        pages.map((p) => ({ mimeType: p.mimeType, base64: p.base64.replace(/\s/g, "") })),
        periodLabel,
      );
      if (!extracted.ok) {
        const msg =
          extracted.error === "AI_BUSY"
            ? locale === "de"
              ? "Google Gemini vorübergehend überlastet (503). 1–2 Minuten warten und erneut versuchen."
              : "Google Gemini geçici yoğun (503). 1–2 dakika bekleyip tekrar deneyin."
            : extracted.error;
        return NextResponse.json({ ok: false, error: msg }, { status: 502 });
      }
      transactions = extracted.transactions;
    }
    if (!transactions.length) {
      return NextResponse.json(
        { ok: false, error: locale === "de" ? "Keine Ausgaben im Kontoauszug gefunden." : "Hesap özetinde çıkış bulunamadı." },
        { status: 422 },
      );
    }

    const invoices = await fetchInvoicesForMatching(supabase, user.id, periodYear, periodMonth);
    const { matches, summary } = await matchTransactionsToInvoices(transactions, invoices, locale);

    const { data: existing } = await supabase
      .from("month_reconciliations")
      .select("id")
      .eq("user_id", user.id)
      .eq("period_year", periodYear)
      .eq("period_month", periodMonth)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("bank_transactions").delete().eq("reconciliation_id", existing.id);
      await supabase.from("month_reconciliations").delete().eq("id", existing.id);
    }

    const matchedCount = matches.filter((m) => m.status === "matched").length;
    const missingCount = matches.length - matchedCount;

    const { data: recRow, error: recErr } = await supabase
      .from("month_reconciliations")
      .insert({
        user_id: user.id,
        period_year: periodYear,
        period_month: periodMonth,
        status: missingCount === 0 ? "completed" : "draft",
        document_id: documentId ?? null,
        bank_txn_count: transactions.length,
        matched_count: matchedCount,
        missing_count: missingCount,
        ai_summary: summary,
        completed_at: missingCount === 0 ? new Date().toISOString() : null,
      })
      .select("id, status")
      .single();

    if (recErr || !recRow) {
      return NextResponse.json({ ok: false, error: recErr?.message ?? "DB" }, { status: 500 });
    }

    const txnRows = transactions.map((t, i) => {
      const m = matches.find((x) => x.txn_index === i);
      return {
        user_id: user.id,
        reconciliation_id: recRow.id,
        line_index: i,
        txn_date: t.date,
        amount: t.amount,
        currency: t.currency,
        counterparty: t.counterparty,
        description: t.description,
        match_status: m?.status ?? "missing_invoice",
        invoice_id: m?.invoice_id ?? null,
        match_confidence: m?.confidence ?? null,
        match_note: m?.note ?? null,
      };
    });

    const { data: insertedTxns, error: txnErr } = await supabase
      .from("bank_transactions")
      .insert(txnRows)
      .select(
        "id, line_index, txn_date, amount, currency, counterparty, description, match_status, invoice_id, match_confidence, match_note",
      );

    if (txnErr) {
      return NextResponse.json({ ok: false, error: txnErr.message }, { status: 500 });
    }

    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv.supplier_name]));

    const result: ReconciliationResult = {
      reconciliationId: recRow.id,
      periodYear,
      periodMonth,
      status: recRow.status as "draft" | "completed",
      bankTxnCount: transactions.length,
      matchedCount,
      missingCount,
      aiSummary: summary,
      transactions: (insertedTxns ?? []).map((row) => ({
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
        supplierName: row.invoice_id ? invoiceMap.get(String(row.invoice_id)) ?? null : null,
      })),
    };

    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
