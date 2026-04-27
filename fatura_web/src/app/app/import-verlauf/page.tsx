"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getImportHistory,
  subscribeImportHistory,
  type ImportHistoryEntry,
} from "@/lib/invoice/importHistoryStore";

function fmtTime(ts: number) {
  try {
    return new Date(ts).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(ts);
  }
}

export default function ImportHistoryPage() {
  const rows = useSyncExternalStore(
    subscribeImportHistory,
    () => getImportHistory(),
    () => [] as ImportHistoryEntry[],
  );

  const counts = useMemo(() => {
    let ok = 0;
    let err = 0;
    let dup = 0;
    for (const r of rows) {
      if (r.status === "ok") ok += 1;
      else if (r.status === "error") err += 1;
      else if (r.status === "duplicate") dup += 1;
    }
    return { ok, err, dup, total: rows.length };
  }, [rows]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">Yükleme geçmişi</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Son yüklemeler bu cihazda saklanır. Başarılı kayıt, tekrar ve hataları buradan takip edebilirsin.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          onClick={() => {
            if (typeof window !== "undefined" && confirm("Geçmişi temizlemek istiyor musun?")) {
              localStorage.removeItem("invoice_import_history_v1");
              window.dispatchEvent(new CustomEvent("invoice-import-history"));
            }
          }}
        >
          Geçmişi temizle
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-4">
          <p className="text-xs text-zinc-500">Başarılı</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{counts.ok}</p>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-4">
          <p className="text-xs text-zinc-500">Tekrar (aynı fatura)</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{counts.dup}</p>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-4">
          <p className="text-xs text-zinc-500">Hata</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{counts.err}</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--app-border)] bg-white">
        <div className="border-b border-[var(--app-border)] px-5 py-3 text-sm font-medium">
          Kayıtlar ({counts.total})
        </div>
        <div className="divide-y divide-[var(--app-border)]">
          {rows.length === 0 ? (
            <div className="px-5 py-8 text-sm text-zinc-600">Henüz kayıt yok.</div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.fileName}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {fmtTime(r.finishedAt)}
                    {r.detail ? ` · ${r.detail}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      r.status === "ok"
                        ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800"
                        : r.status === "duplicate"
                          ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
                          : "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800"
                    }
                  >
                    {r.status === "ok" ? "Kaydedildi" : r.status === "duplicate" ? "Tekrar" : "Hata"}
                  </span>
                  {r.invoiceId && r.status === "ok" ? (
                    <a
                      className="rounded-lg border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-50"
                      href={`/app/invoices/${r.invoiceId}`}
                    >
                      Fatura
                    </a>
                  ) : null}
                  {r.status === "duplicate" && r.invoiceId ? (
                    <a
                      className="rounded-lg border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-50"
                      href={`/app/invoices/${r.invoiceId}`}
                    >
                      Mevcut kayıt
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
