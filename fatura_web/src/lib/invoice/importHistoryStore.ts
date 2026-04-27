const HISTORY_KEY = "invoice_import_history_v1";
const MAX_ENTRIES = 80;

export type ImportHistoryEntry = {
  id: string;
  fileName: string;
  startedAt: number;
  finishedAt: number;
  status: "ok" | "error" | "duplicate";
  detail?: string;
  invoiceId?: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function appendImportHistory(entry: Omit<ImportHistoryEntry, "id"> & { id?: string }): void {
  if (typeof window === "undefined") return;
  try {
    const prev = getImportHistory();
    const row: ImportHistoryEntry = {
      id: entry.id ?? uid(),
      ...entry,
    };
    const next = [row, ...prev.filter((r) => r.id !== row.id)].slice(0, MAX_ENTRIES);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("invoice-import-history"));
  } catch {
    /* quota */
  }
}

export function getImportHistory(): ImportHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as ImportHistoryEntry[];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export function subscribeImportHistory(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const w = () => cb();
  window.addEventListener("invoice-import-history", w);
  return () => window.removeEventListener("invoice-import-history", w);
}
