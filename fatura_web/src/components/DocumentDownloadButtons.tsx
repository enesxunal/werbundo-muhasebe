"use client";

import { useState } from "react";
import {
  downloadDocumentAsJpg,
  downloadDocumentAsPdf,
  type DocumentDownloadSource,
} from "@/lib/document/downloadDocument";
import { useI18n } from "@/lib/i18n/LocaleContext";

type Props = {
  document: DocumentDownloadSource;
  className?: string;
};

export function DocumentDownloadButtons({ document: doc, className = "" }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"jpg" | "pdf" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(kind: "jpg" | "pdf") {
    setErr(null);
    setBusy(kind);
    try {
      if (kind === "jpg") await downloadDocumentAsJpg(doc);
      else await downloadDocumentAsPdf(doc);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run("jpg")}
          className="rounded-lg border border-[var(--app-border)] bg-white px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          {busy === "jpg" ? "…" : t("doc.downloadJpg")}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run("pdf")}
          className="rounded-lg border border-[var(--app-border)] bg-white px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          {busy === "pdf" ? "…" : t("doc.downloadPdf")}
        </button>
      </div>
      {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
    </div>
  );
}
