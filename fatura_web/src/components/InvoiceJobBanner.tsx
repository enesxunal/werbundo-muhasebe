"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  clearInvoiceJob,
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "@/lib/jobs/invoiceUploadJobStore";
import { useOptionalI18n } from "@/lib/i18n/LocaleContext";

export function InvoiceJobBanner() {
  const job = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const i18n = useOptionalI18n();

  const t = useMemo(() => i18n?.t ?? ((p: string) => p), [i18n]);

  const stepLabel = (raw: string) => {
    const resolved = t(raw);
    return resolved !== raw ? resolved : raw;
  };

  useEffect(() => {
    if (job?.status !== "ok") return;
    const timer = window.setTimeout(() => clearInvoiceJob(), 8000);
    return () => window.clearTimeout(timer);
  }, [job]);

  if (!job) return null;

  if (job.status === "running") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 shadow-lg">
          <p className="font-medium">{t("job.runningTitle")}</p>
          <p className="mt-1 text-blue-900/90">
            {job.fileName} · {stepLabel(job.step)} · %{Math.round((job.progress ?? 0) * 100)}
          </p>
          <p className="mt-2 text-xs text-blue-800/80">{t("job.runningHint")}</p>
        </div>
      </div>
    );
  }

  if (job.status === "duplicate") {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
          <p className="font-medium">{t("job.dupTitle")}</p>
          <p className="mt-1 text-amber-900/95">{job.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {job.existingInvoiceId ? (
              <a
                className="rounded-xl bg-amber-900 px-4 py-2 text-xs font-medium text-white hover:bg-amber-800"
                href={`/app/invoices/${job.existingInvoiceId}`}
              >
                {t("job.dupRecord")}
              </a>
            ) : null}
            <a
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs hover:bg-amber-100/50"
              href="/app/import-verlauf"
            >
              {t("job.dupHistory")}
            </a>
            <button
              type="button"
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs hover:bg-amber-100/50"
              onClick={() => clearInvoiceJob()}
            >
              {t("job.close")}
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
          <p className="font-medium">{t("job.errTitle")}</p>
          <p className="mt-1 whitespace-pre-wrap text-red-900/95">{job.error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="rounded-xl bg-red-900 px-4 py-2 text-xs font-medium text-white hover:bg-red-800"
              href="/app/upload"
            >
              {t("job.retry")}
            </a>
            <button
              type="button"
              className="rounded-xl border border-red-300 bg-white px-4 py-2 text-xs hover:bg-red-100/50"
              onClick={() => clearInvoiceJob()}
            >
              {t("job.close")}
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
              {t("job.okOpen")}
            </a>
          ) : null}
        </div>
        <div className="flex gap-2">
          <a
            className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs hover:bg-emerald-100/50"
            href="/app/import-verlauf"
          >
            {t("job.okHistory")}
          </a>
          <button
            type="button"
            className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs hover:bg-emerald-100/50"
            onClick={() => clearInvoiceJob()}
          >
            {t("job.okDismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
