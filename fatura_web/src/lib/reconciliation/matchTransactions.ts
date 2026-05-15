import { runAiJson } from "@/lib/reconciliation/aiJson";
import type { ExtractedBankTxn, InvoiceForMatch, TxnMatchRow } from "@/lib/reconciliation/types";

type MatchResponse = {
  matches?: TxnMatchRow[];
  summary?: string | null;
};

const SYSTEM = [
  "You match bank outgoing payments to uploaded supplier invoices for accounting reconciliation.",
  "Rules:",
  "- Each bank transaction needs at most ONE invoice.",
  "- Each invoice can match at most ONE transaction.",
  "- Match primarily by AMOUNT (exact or within 0.05) AND supplier name similarity (fuzzy: Shell vs Shell Station GmbH).",
  "- Invoice issue_date may differ from payment date (before or after); do NOT require same month.",
  "- If no invoice fits, status = missing_invoice.",
  "- Do NOT list invoices that have no bank payment as problems (cash payments are OK).",
  "Return ONLY valid JSON.",
].join("\n");

function buildCatalog(invoices: InvoiceForMatch[]): string {
  return invoices
    .map(
      (inv, i) =>
        `[${i}] id=${inv.id} | ${inv.supplier_name} | ${inv.total.toFixed(2)} ${inv.currency} | ${inv.issue_date} | nr=${inv.invoice_no ?? "—"}`,
    )
    .join("\n");
}

function buildTxnList(txns: ExtractedBankTxn[]): string {
  return txns
    .map(
      (t, i) =>
        `[${i}] ${t.date ?? "?"} | ${t.amount.toFixed(2)} ${t.currency} | ${t.counterparty ?? "—"} | ${(t.description ?? "").slice(0, 80)}`,
    )
    .join("\n");
}

/** Tutar + isim ile AI eşleştirme; başarısızsa basit tutar eşleştirmesi */
export async function matchTransactionsToInvoices(
  transactions: ExtractedBankTxn[],
  invoices: InvoiceForMatch[],
  locale: "tr" | "de",
): Promise<{ matches: TxnMatchRow[]; summary: string | null }> {
  if (!transactions.length) {
    return { matches: [], summary: null };
  }

  if (invoices.length) {
    const result = await runAiJson<MatchResponse>({
      system: SYSTEM,
      userText: [
        locale === "de" ? "Sprache der Zusammenfassung: Deutsch." : "Özet Türkçe olsun.",
        "BANK TRANSACTIONS:",
        buildTxnList(transactions),
        "",
        "INVOICES:",
        buildCatalog(invoices),
        "",
        "Return JSON:",
        '{ "matches": [ { "txn_index": 0, "invoice_id": "uuid|null", "status": "matched|missing_invoice", "confidence": 0-100, "note": "string" } ], "summary": "short overview" }',
        "Include one entry per bank transaction index.",
      ].join("\n"),
    });

    if (result.ok && Array.isArray(result.data.matches)) {
      const usedInvoices = new Set<string>();
      const matches: TxnMatchRow[] = transactions.map((_, txn_index) => {
        const row = result.data.matches?.find((m) => m.txn_index === txn_index);
        if (!row) {
          return { txn_index, invoice_id: null, status: "missing_invoice" as const, confidence: null, note: null };
        }
        let invoice_id = row.invoice_id;
        if (invoice_id && usedInvoices.has(invoice_id)) invoice_id = null;
        if (invoice_id) usedInvoices.add(invoice_id);
        const status =
          row.status === "matched" && invoice_id ? ("matched" as const) : ("missing_invoice" as const);
        return {
          txn_index,
          invoice_id: status === "matched" ? invoice_id : null,
          status,
          confidence: typeof row.confidence === "number" ? row.confidence : null,
          note: row.note ?? null,
        };
      });
      return { matches, summary: result.data.summary ?? null };
    }
  }

  return { matches: fallbackMatch(transactions, invoices), summary: null };
}

function fallbackMatch(transactions: ExtractedBankTxn[], invoices: InvoiceForMatch[]): TxnMatchRow[] {
  const used = new Set<string>();
  return transactions.map((txn, txn_index) => {
    const hit = invoices.find((inv) => {
      if (used.has(inv.id)) return false;
      if (inv.currency.toUpperCase() !== txn.currency.toUpperCase()) return false;
      if (Math.abs(inv.total - txn.amount) > 0.05) return false;
      return true;
    });
    if (hit) {
      used.add(hit.id);
      return {
        txn_index,
        invoice_id: hit.id,
        status: "matched",
        confidence: 70,
        note: "amount",
      };
    }
    return { txn_index, invoice_id: null, status: "missing_invoice", confidence: null, note: null };
  });
}
