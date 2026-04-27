"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getImportHistory,
  subscribeImportHistory,
  type ImportHistoryEntry,
} from "@/lib/invoice/importHistoryStore";
import { useI18n } from "@/lib/i18n/LocaleContext";

function fmtTime(ts: number, localeTag: string) {
  try {
    return new Date(ts).toLocaleString(localeTag, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return String(ts);
  }
}

export default function ImportHistoryPage() {
  const { t, locale } = useI18n();
  const localeTag = locale === "de" ? "de-DE" : "tr-TR";

  /** İlk boyama sunucu + istemci aynı ([]) olmalı; localStorage yalnızca mount sonrası — hydration hatası önlenir. */
  const [rows, setRows] = useState<ImportHistoryEntry[]>([]);

  useEffect(() => {
    function refresh() {
      setRows(getImportHistory());
    }
    refresh();
    return subscribeImportHistory(refresh);
  }, []);

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
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("importHistory.title")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("importHistory.intro")}</p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          onClick={() => {
            if (typeof window !== "undefined" && confirm(t("importHistory.clearConfirm"))) {
              localStorage.removeItem("invoice_import_history_v1");
              window.dispatchEvent(new CustomEvent("invoice-import-history"));
            }
          }}
        >
          {t("importHistory.clearBtn")}
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-4">
          <p className="text-xs text-zinc-500">{t("importHistory.statOk")}</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{counts.ok}</p>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-4">
          <p className="text-xs text-zinc-500">{t("importHistory.statDup")}</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{counts.dup}</p>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-4">
          <p className="text-xs text-zinc-500">{t("importHistory.statErr")}</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">{counts.err}</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--app-border)] bg-white">
        <div className="border-b border-[var(--app-border)] px-5 py-3 text-sm font-medium">
          {t("importHistory.records", { n: counts.total })}
        </div>
        <div className="divide-y divide-[var(--app-border)]">
          {rows.length === 0 ? (
            <div className="px-5 py-8 text-sm text-zinc-600">{t("importHistory.empty")}</div>
          ) : (
            rows.map((r, idx) => (
              <div
                key={r.id ?? `row-${r.finishedAt}-${idx}`}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.fileName}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {fmtTime(r.finishedAt, localeTag)}
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
                    {r.status === "ok"
                      ? t("importHistory.statusOk")
                      : r.status === "duplicate"
                        ? t("importHistory.statusDup")
                        : t("importHistory.statusErr")}
                  </span>
                  {r.invoiceId && r.status === "ok" ? (
                    <a
                      className="rounded-lg border border-[var(--app-border)] px-3 py-1 text-xs hover:bg-zinc-50"
                      href={`/app/invoices/${r.invoiceId}`}
                    >
                      {t("importHistory.openInvoice")}
                    </a>
                  ) : null}
                  {r.status === "duplicate" && r.invoiceId ? (
                    <a
                      className="rounded-lg border border-[var(--app-border)] px-3 py-1 text-xs hover:bg-zinc-50"
                      href={`/app/invoices/${r.invoiceId}`}
                    >
                      {t("importHistory.openExisting")}
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
