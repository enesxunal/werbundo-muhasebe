export const INVOICE_JOB_EVENT = "invoice-import-job-event";

const KEY = "invoice_import_job_v2";

export type InvoiceJobSnapshot =
  | {
      status: "running";
      step: string;
      progress: number;
      fileName: string;
      startedAt: number;
    }
  | {
      status: "ok";
      message: string;
      finishedAt: number;
      fileName?: string;
      invoiceId?: string;
    }
  | {
      status: "duplicate";
      message: string;
      finishedAt: number;
      fileName?: string;
      existingInvoiceId?: string;
    }
  | {
      status: "error";
      error: string;
      finishedAt: number;
      fileName?: string;
    };

let snapshot: InvoiceJobSnapshot | null = null;
const listeners = new Set<() => void>();
let didHydrate = false;

function hydrateFromStorage() {
  if (typeof window === "undefined" || didHydrate) return;
  didHydrate = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as InvoiceJobSnapshot;
    if (j.status === "running") {
      const started = (j as { startedAt?: number }).startedAt ?? 0;
      const age = Date.now() - started;
      if (age > 25 * 60 * 1000) {
        snapshot = {
          status: "error",
          error:
            "İşlem yarım kaldı (çok uzun süre bekledi veya sekme tamamen kapatıldı). Aynı faturayı tekrar yükleyin. İleride tamamlanınca e-posta da gönderebiliriz.",
          finishedAt: Date.now(),
          fileName: (j as { fileName?: string }).fileName,
        };
        localStorage.setItem(KEY, JSON.stringify(snapshot));
      } else {
        snapshot = j;
      }
    } else {
      snapshot = j;
    }
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(INVOICE_JOB_EVENT));
    try {
      if (snapshot) localStorage.setItem(KEY, JSON.stringify(snapshot));
      else localStorage.removeItem(KEY);
    } catch {
      /* quota */
    }
  }
}

export function getServerSnapshot(): InvoiceJobSnapshot | null {
  return null;
}

export function getSnapshot(): InvoiceJobSnapshot | null {
  if (typeof window !== "undefined") hydrateFromStorage();
  return snapshot;
}

export function subscribe(cb: () => void): () => void {
  hydrateFromStorage();
  listeners.add(cb);
  if (typeof window !== "undefined") {
    const w = () => cb();
    window.addEventListener(INVOICE_JOB_EVENT, w);
    return () => {
      listeners.delete(cb);
      window.removeEventListener(INVOICE_JOB_EVENT, w);
    };
  }
  return () => listeners.delete(cb);
}

export function setInvoiceJob(next: InvoiceJobSnapshot | null) {
  snapshot = next;
  emit();
}

export function clearInvoiceJob() {
  snapshot = null;
  emit();
}
