import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceForMatch } from "@/lib/reconciliation/types";

/** Mutabakat ayına yakın geniş aralıktaki tüm faturalar (tarih gevşek) */
export async function fetchInvoicesForMatching(
  supabase: SupabaseClient,
  userId: string,
  periodYear: number,
  periodMonth: number,
): Promise<InvoiceForMatch[]> {
  const start = new Date(periodYear, periodMonth - 1 - 4, 1);
  const end = new Date(periodYear, periodMonth, 0);
  const fromIso = start.toISOString().slice(0, 10);
  const toIso = end.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("invoices")
    .select("id, issue_date, total, currency, invoice_no, customer:customers(name)")
    .eq("user_id", userId)
    .gte("issue_date", fromIso)
    .lte("issue_date", toIso)
    .order("issue_date", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const c = row.customer as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(c) ? c[0]?.name : c?.name;
    return {
      id: String(row.id),
      issue_date: String(row.issue_date),
      total: Number(row.total) || 0,
      currency: String(row.currency ?? "EUR").toUpperCase(),
      invoice_no: row.invoice_no ? String(row.invoice_no) : null,
      supplier_name: String(name ?? "").trim() || "—",
    };
  });
}
