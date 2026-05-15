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
  "When multiple statement pages are provided, extract from ALL pages in order.",
  "Return ONLY valid JSON, no markdown.",
].join("\n");

/** Her API çağrısında en fazla kaç sayfa (503 / kota için) */
const PAGES_PER_AI_CALL = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

export function dedupeBankTransactions(txns: ExtractedBankTxn[]): ExtractedBankTxn[] {
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
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: true; transactions: ExtractedBankTxn[] } | { ok: false; error: string }> {
  const all: ExtractedBankTxn[] = [];
  const totalBatches = Math.ceil(pages.length / PAGES_PER_AI_CALL);

  for (let b = 0; b < totalBatches; b++) {
    const start = b * PAGES_PER_AI_CALL;
    const batch = pages.slice(start, start + PAGES_PER_AI_CALL);
    onProgress?.(b + 1, totalBatches);

    const pageNums = batch.map((_, j) => start + j + 1).join(", ");
    const result = await runAiJson<ExtractResponse>({
      system: SYSTEM,
      images: batch.map((p) => ({ mimeType: p.mimeType, base64: p.base64 })),
      userText: [
        `Kontoauszug pages ${pageNums} of ${pages.length}. Period: ${periodLabel}.`,
        "Extract all outgoing payments visible on these page(s).",
        'Return JSON: { "transactions": [ { "date", "amount", "currency", "counterparty", "description", "direction": "out" } ] }',
      ].join("\n"),
    });

    if (!result.ok) {
      const friendly =
        result.error.includes("503") || result.error.includes("429")
          ? "AI_BUSY"
          : result.error;
      return { ok: false, error: friendly };
    }

    for (const raw of result.data.transactions ?? []) {
      const n = normalizeTxn(raw);
      if (n) all.push(n);
    }

    if (b + 1 < totalBatches) {
      await sleep(1500);
    }
  }

  return { ok: true, transactions: dedupeBankTransactions(all) };
}
