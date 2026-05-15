import { runAiJson } from "@/lib/reconciliation/aiJson";
import type { ExtractedBankTxn } from "@/lib/reconciliation/types";

type ExtractResponse = {
  transactions?: Array<{
    date?: string | null;
    amount?: number | null;
    currency?: string | null;
    counterparty?: string | null;
    description?: string | null;
    direction?: string | null;
  }>;
};

const SYSTEM = [
  "You read German bank account statements (Kontoauszug), e.g. Sparkasse.",
  "Extract ONLY outgoing payments (debits, Soll, money leaving the account).",
  "Skip: incoming credits, salary received, internal transfers between own accounts if clearly marked.",
  "Skip: balance lines, headers, footers, interest summaries.",
  "For each outgoing payment return: date (ISO YYYY-MM-DD), amount as POSITIVE number, currency (EUR default), counterparty (Empfänger / name), description (Verwendungszweck).",
  "German amounts: 1.234,56 means 1234.56.",
  "Return ONLY valid JSON, no markdown.",
].join("\n");

function normalizeTxn(raw: NonNullable<ExtractResponse["transactions"]>[number]): ExtractedBankTxn | null {
  const amount = typeof raw.amount === "number" ? Math.abs(raw.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 0.001) return null;
  const dir = String(raw.direction ?? "out").toLowerCase();
  if (dir === "in" || dir === "credit" || dir === "incoming") return null;

  let date: string | null = null;
  if (raw.date && /^\d{4}-\d{2}-\d{2}/.test(String(raw.date))) {
    date = String(raw.date).slice(0, 10);
  }

  return {
    date,
    amount,
    currency: String(raw.currency ?? "EUR").toUpperCase().slice(0, 3) || "EUR",
    counterparty: raw.counterparty ? String(raw.counterparty).trim().slice(0, 500) : null,
    description: raw.description ? String(raw.description).trim().slice(0, 800) : null,
  };
}

function dedupeTxns(txns: ExtractedBankTxn[]): ExtractedBankTxn[] {
  const seen = new Set<string>();
  const out: ExtractedBankTxn[] = [];
  for (const t of txns) {
    const key = `${t.date ?? ""}|${t.amount.toFixed(2)}|${t.counterparty ?? ""}|${(t.description ?? "").slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function extractBankTransactionsFromPages(
  pages: Array<{ mimeType: string; base64: string }>,
  periodLabel: string,
): Promise<{ ok: true; transactions: ExtractedBankTxn[] } | { ok: false; error: string }> {
  const all: ExtractedBankTxn[] = [];

  for (let i = 0; i < pages.length; i++) {
    const result = await runAiJson<ExtractResponse>({
      system: SYSTEM,
      images: [pages[i]],
      userText: [
        `Page ${i + 1} of ${pages.length}. Statement period context: ${periodLabel}.`,
        "Return JSON: { \"transactions\": [ { \"date\", \"amount\", \"currency\", \"counterparty\", \"description\", \"direction\": \"out\" } ] }",
      ].join("\n"),
    });
    if (!result.ok) return result;
    for (const raw of result.data.transactions ?? []) {
      const n = normalizeTxn(raw);
      if (n) all.push(n);
    }
  }

  return { ok: true, transactions: dedupeTxns(all) };
}
