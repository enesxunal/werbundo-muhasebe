export type ExtractedBankTxn = {
  date: string | null;
  amount: number;
  currency: string;
  counterparty: string | null;
  description: string | null;
};

export type InvoiceForMatch = {
  id: string;
  issue_date: string;
  total: number;
  currency: string;
  invoice_no: string | null;
  supplier_name: string;
};

export type TxnMatchRow = {
  txn_index: number;
  invoice_id: string | null;
  status: "matched" | "missing_invoice";
  confidence: number | null;
  note: string | null;
};

export type ReconciliationResult = {
  reconciliationId: string;
  periodYear: number;
  periodMonth: number;
  status: "draft" | "completed";
  bankTxnCount: number;
  matchedCount: number;
  missingCount: number;
  aiSummary: string | null;
  transactions: Array<{
    id: string;
    lineIndex: number;
    txnDate: string | null;
    amount: number;
    currency: string;
    counterparty: string | null;
    description: string | null;
    matchStatus: "matched" | "missing_invoice";
    invoiceId: string | null;
    matchConfidence: number | null;
    matchNote: string | null;
    supplierName?: string | null;
  }>;
};
