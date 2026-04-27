"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  clearInvoiceJob,
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "@/lib/jobs/invoiceUploadJobStore";

export function InvoiceJobBanner() {
  const job = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (job?.status !== "ok") return;
    const t = window.setTimeout(() => clearInvoiceJob(), 8000);
    return () => window.clearTimeout(t);
  }, [job]);

  if (!job) return null;

  if (job.status === "running") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 shadow-lg">
          <p className="font-medium">Fatura arka planda işleniyor</p>
          <p className="mt-1 text-blue-900/90">
            {job.fileName} · {job.step} · %{Math.round((job.progress ?? 0) * 100)}
          </p>
          <p className="mt-2 text-xs text-blue-800/80">
            Başka menüye geçebilirsin; işlem sunucuda tamamlanır. Tarayıcıyı tamamen kapatırsan işlem yarıda kalabilir.
          </p>
        </div>
      </div>
    );
  }

  if (job.status === "duplicate") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
          <p className="font-medium">Bu fatura zaten kayıtlı</p>
          <p className="mt-1 text-amber-900/95">{job.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {job.existingInvoiceId ? (
              <a
                className="rounded-xl bg-amber-900 px-4 py-2 text-xs font-medium text-white hover:bg-amber-800"
                href={`/app/invoices/${job.existingInvoiceId}`}
              >
                Kayda git
              </a>
            ) : null}
            <a className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs hover:bg-amber-100/50" href="/app/import-verlauf">
              Yükleme geçmişi
            </a>
            <button
              type="button"
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs hover:bg-amber-100/50"
              onClick={() => clearInvoiceJob()}
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (job.status === "error") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 shadow-lg">
          <p className="font-medium">Fatura kaydı hata verdi</p>
          <p className="mt-1 whitespace-pre-wrap text-red-900/95">{job.error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="rounded-xl bg-red-900 px-4 py-2 text-xs font-medium text-white hover:bg-red-800"
              href="/app/upload"
            >
              Tekrar dene
            </a>
            <button
              type="button"
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-xs hover:bg-red-100/50"
              onClick={() => clearInvoiceJob()}
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    );
  }

  const okJob = job.status === "ok" ? job : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{job.message}</p>
          {okJob?.invoiceId ? (
            <a className="mt-1 inline-block text-xs underline" href={`/app/invoices/${okJob.invoiceId}`}>
              Faturayı aç
            </a>
          ) : null}
        </div>
        <div className="flex gap-2">
          <a
            className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs hover:bg-emerald-100/50"
            href="/app/import-verlauf"
          >
            Geçmiş
          </a>
          <button
            type="button"
            className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs hover:bg-emerald-100/50"
            onClick={() => clearInvoiceJob()}
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
