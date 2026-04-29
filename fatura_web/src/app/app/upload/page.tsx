"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { runInvoiceOcr } from "@/lib/ocr/runOcr";
import { prepareInvoiceImageForVision } from "@/lib/vision/prepareInvoiceImageForVision";
import { appendImportHistory } from "@/lib/invoice/importHistoryStore";
import { DuplicateInvoiceError, persistUploadDraft, type UploadInvoiceDraft } from "@/lib/invoice/persistUploadDraft";
import {
  clearInvoiceJob,
  getServerSnapshot,
  getSnapshot,
  setInvoiceJob,
  subscribe,
} from "@/lib/jobs/invoiceUploadJobStore";
import { useI18n } from "@/lib/i18n/LocaleContext";

type ExtractedItem = {
  lineNo?: number;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
};

type AiItem = {
  line_no?: number | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
};

type AiExtract = {
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    tax_no?: string | null;
    tax_office?: string | null;
  };
  invoice?: {
    issue_date?: string | null;
    currency?: "TRY" | "USD" | "EUR" | null;
    invoice_no?: string | null;
    subtotal?: number | null;
    vat_total?: number | null;
    total?: number | null;
    confidence?: number | null;
  };
  items?: AiItem[];
};

export default function UploadPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const { t } = useI18n();

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ status: string; progress: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Review state (kullanıcı düzeltip onaylar)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerTaxNo, setCustomerTaxNo] = useState("");
  const [customerTaxOffice, setCustomerTaxOffice] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<"TRY" | "USD" | "EUR">("EUR");
  const [subtotal, setSubtotal] = useState<string>("");
  const [vatTotal, setVatTotal] = useState<string>("");
  const [total, setTotal] = useState<string>("");
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState<string>("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [aiApplied, setAiApplied] = useState(false);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const backgroundRunning =
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)?.status === "running";

  function toNum(v: string) {
    const cleaned = v.replace(",", ".").trim();
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }

  function computeWarnings(next: {
    customerName: string;
    issueDate: string;
    subtotal?: number;
    vatTotal?: number;
    total?: number;
    items?: ExtractedItem[];
  }) {
    const w: string[] = [];
    const s = next.subtotal;
    const v = next.vatTotal;
    const tot = next.total;
    if (typeof s === "number" && typeof v === "number" && typeof tot === "number") {
      const diff = Math.abs((s + v) - tot);
      if (diff > 0.02)
        w.push(
          t("upload.warnTotalMismatch").replace("{a}", (s + v).toFixed(2)).replace("{b}", tot.toFixed(2)),
        );
    }
    if (!next.customerName.trim()) w.push(t("upload.warnSupplierEmpty"));
    if (!next.issueDate) w.push(t("upload.warnDateEmpty"));
    if (next.items && next.items.length > 0) {
      const sum = next.items
        .map((i) => i.lineTotal)
        .filter((n): n is number => typeof n === "number")
        .reduce((a, b) => a + b, 0);
      if (typeof tot === "number" && sum > 0) {
        const diff = Math.abs(sum - tot);
        if (diff > 0.5)
          w.push(t("upload.warnLinesVsTotal").replace("{sum}", sum.toFixed(2)).replace("{total}", tot.toFixed(2)));
      }
    }
    return w;
  }

  useEffect(() => {
    if (!reviewOpen) return;
    const subN = toNum(subtotal);
    const vatN = toNum(vatTotal);
    const totN = toNum(total);
    setWarnings(
      computeWarnings({
        customerName,
        issueDate,
        subtotal: subN,
        vatTotal: vatN,
        total: totN,
        items,
      }),
    );
  }, [reviewOpen, customerName, issueDate, subtotal, vatTotal, total, items, t]);

  async function callExtractInvoice(
    text: string,
    vision: { imageBase64: string; mimeType: string } | null,
  ): Promise<{ ok: true; data: AiExtract } | { ok: false; error: string }> {
    try {
      const resp = await fetch("/api/extract-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocrText: text,
          ...(vision ? { imageBase64: vision.imageBase64, mimeType: vision.mimeType } : {}),
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        return { ok: false, error: String(json?.error ?? t("upload.aiExtractFail")) };
      }
      return { ok: true, data: json.data as AiExtract };
    } catch {
      return { ok: false, error: t("upload.aiExtractFail") };
    }
  }

  function mergeAiOntoOcrDraft(args: {
    ocr: {
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      customerAddress: string;
      customerTaxNo: string;
      customerTaxOffice: string;
      invoiceNo: string;
      issueDate: string;
      currency: "TRY" | "USD" | "EUR";
      subtotal: string;
      vatTotal: string;
      total: string;
      items: ExtractedItem[];
      confidence?: number | null;
    };
    ai: AiExtract;
  }) {
    const c = args.ai.customer;
    const inv = args.ai.invoice;

    const aiName = (c?.name ?? "").trim();
    const aiEmail = c?.email != null ? String(c.email) : "";
    const aiPhone = c?.phone != null ? String(c.phone) : "";
    const aiAddress = c?.address != null ? String(c.address) : "";
    const aiTaxNo = c?.tax_no != null ? String(c.tax_no) : "";
    const aiTaxOffice = c?.tax_office != null ? String(c.tax_office) : "";

    const aiIssue = inv?.issue_date ? String(inv.issue_date) : "";
    const aiCurrency = inv?.currency ?? null;
    const aiInvoiceNo = inv?.invoice_no != null ? String(inv.invoice_no) : "";

    const aiSub = typeof inv?.subtotal === "number" ? inv.subtotal : undefined;
    const aiVat = typeof inv?.vat_total === "number" ? inv.vat_total : undefined;
    const aiTot = typeof inv?.total === "number" ? inv.total : undefined;

    const mappedItems =
      (args.ai.items ?? [])
        .filter((it) => (it.description ?? "").trim().length > 0)
        .map((it) => ({
          lineNo: typeof it.line_no === "number" ? it.line_no : undefined,
          description: String(it.description ?? "").trim(),
          quantity: typeof it.quantity === "number" ? it.quantity : undefined,
          unit: it.unit ? String(it.unit) : undefined,
          unitPrice: typeof it.unit_price === "number" ? it.unit_price : undefined,
          lineTotal: typeof it.line_total === "number" ? it.line_total : undefined,
        })) ?? [];

    return {
      customerName: aiName || args.ocr.customerName,
      customerEmail: aiEmail || args.ocr.customerEmail,
      customerPhone: aiPhone || args.ocr.customerPhone,
      customerAddress: aiAddress || args.ocr.customerAddress,
      customerTaxNo: aiTaxNo || args.ocr.customerTaxNo,
      customerTaxOffice: aiTaxOffice || args.ocr.customerTaxOffice,
      invoiceNo: aiInvoiceNo || args.ocr.invoiceNo,
      issueDate: aiIssue || args.ocr.issueDate,
      currency: (aiCurrency ?? args.ocr.currency) as "TRY" | "USD" | "EUR",
      subtotal:
        typeof aiSub === "number"
          ? aiSub.toFixed(2)
          : args.ocr.subtotal,
      vatTotal:
        typeof aiVat === "number"
          ? aiVat.toFixed(2)
          : args.ocr.vatTotal,
      total:
        typeof aiTot === "number"
          ? aiTot.toFixed(2)
          : args.ocr.total,
      items: mappedItems.length ? mappedItems : args.ocr.items,
      confidence: typeof inv?.confidence === "number" ? inv.confidence : null,
    };
  }

  function toUploadDraft(m: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    customerTaxNo: string;
    customerTaxOffice: string;
    invoiceNo: string;
    issueDate: string;
    currency: "TRY" | "USD" | "EUR";
    subtotal: string;
    vatTotal: string;
    total: string;
    items: ExtractedItem[];
  }): UploadInvoiceDraft {
    return {
      customerName: m.customerName,
      customerEmail: m.customerEmail,
      customerPhone: m.customerPhone,
      customerAddress: m.customerAddress,
      customerTaxNo: m.customerTaxNo,
      customerTaxOffice: m.customerTaxOffice,
      invoiceNo: m.invoiceNo,
      issueDate: m.issueDate,
      currency: m.currency,
      subtotal: m.subtotal,
      vatTotal: m.vatTotal,
      total: m.total,
      items: m.items,
    };
  }

  function buildDraftFromState(): UploadInvoiceDraft {
    return toUploadDraft({
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerTaxNo,
      customerTaxOffice,
      invoiceNo,
      issueDate,
      currency,
      subtotal,
      vatTotal,
      total,
      items,
    });
  }

  function process() {
    setError(null);
    setMessage(null);
    setReviewOpen(false);
    if (!supabase) {
      setError(t("dashboard.envMissing"));
      return;
    }
    if (!file) {
      setError(t("upload.selectFile"));
      return;
    }
    if (getSnapshot()?.status === "running") {
      setError(t("upload.busyOther"));
      return;
    }

    const sb = supabase;
    const currentFile = file;
    const startedAt = Date.now();
    clearInvoiceJob();

    const updateJobRunning = (step: string, progress: number) => {
      setInvoiceJob({
        status: "running",
        step,
        progress,
        fileName: currentFile.name,
        startedAt,
      });
    };

    if (aliveRef.current) {
      setProgress({ status: t("job.step.start"), progress: 0 });
    }
    updateJobRunning("job.step.start", 0);

    void (async () => {
      try {
        const { data: userData, error: userErr } = await sb.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          window.location.href = "/login";
          return;
        }

        const emptyBaseDraft: {
          customerName: string;
          customerEmail: string;
          customerPhone: string;
          customerAddress: string;
          customerTaxNo: string;
          customerTaxOffice: string;
          invoiceNo: string;
          issueDate: string;
          currency: "TRY" | "USD" | "EUR";
          subtotal: string;
          vatTotal: string;
          total: string;
          items: ExtractedItem[];
          confidence: number | null;
        } = {
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          customerAddress: "",
          customerTaxNo: "",
          customerTaxOffice: "",
          invoiceNo: "",
          issueDate: new Date().toISOString().slice(0, 10),
          currency: "EUR",
          subtotal: "",
          vatTotal: "",
          total: "",
          items: [],
          confidence: null,
        };

        let hadTesseractOcr = false;
        let ocrTextForApi = "";
        let ocrDraft = emptyBaseDraft;

        updateJobRunning("job.step.prepare", 0.08);
        if (aliveRef.current) {
          setProgress({ status: t("job.step.prepare"), progress: 0.08 });
        }
        const visionPayload = await prepareInvoiceImageForVision(currentFile);

        if (visionPayload) {
          ocrTextForApi = "";
          ocrDraft = { ...emptyBaseDraft };
          if (aliveRef.current) setOcrText("");
        } else {
          hadTesseractOcr = true;
          updateJobRunning("job.step.ocr", 0.12);
          if (aliveRef.current) {
            setProgress({ status: t("job.step.ocr"), progress: 0.12 });
          }
          const { extracted, text } = await runInvoiceOcr({
            file: currentFile,
            onProgress: (p) => {
              updateJobRunning(p.status, Math.min(0.45, 0.12 + (p.progress ?? 0) * 0.35));
              if (aliveRef.current)
                setProgress({
                  status: p.status.startsWith("job.") ? t(p.status) : p.status,
                  progress: Math.min(0.45, 0.12 + (p.progress ?? 0) * 0.35),
                });
            },
          });
          ocrTextForApi = text;
          if (aliveRef.current) setOcrText(text);

          const cName = extracted.customerName?.trim() ?? "";
          const iDate = extracted.issueDateISO ?? new Date().toISOString().slice(0, 10);
          const cur = (extracted.currency ?? "EUR") as "TRY" | "USD" | "EUR";
          const totalEx = typeof extracted.total === "number" ? extracted.total : undefined;
          const v = typeof extracted.vatTotal === "number" ? extracted.vatTotal : undefined;
          const s = typeof totalEx === "number" && typeof v === "number" ? Math.max(0, totalEx - v) : undefined;
          const ocrItems = (extracted.items ?? []) as ExtractedItem[];
          ocrDraft = {
            customerName: cName,
            customerEmail: extracted.customerEmail ?? "",
            customerPhone: extracted.customerPhone ?? "",
            customerAddress: extracted.customerAddress ?? "",
            customerTaxNo: "",
            customerTaxOffice: "",
            invoiceNo: "",
            issueDate: iDate,
            currency: cur,
            subtotal: typeof s === "number" ? s.toFixed(2) : "",
            vatTotal: typeof v === "number" ? v.toFixed(2) : "",
            total: typeof totalEx === "number" ? totalEx.toFixed(2) : "",
            items: ocrItems,
            confidence: null as number | null,
          };

          if (aliveRef.current) {
            setCustomerName(ocrDraft.customerName);
            setCustomerEmail(ocrDraft.customerEmail);
            setCustomerPhone(ocrDraft.customerPhone);
            setCustomerAddress(ocrDraft.customerAddress);
            setCustomerTaxNo(ocrDraft.customerTaxNo);
            setCustomerTaxOffice(ocrDraft.customerTaxOffice);
            setInvoiceNo(ocrDraft.invoiceNo);
            setIssueDate(ocrDraft.issueDate);
            setCurrency(ocrDraft.currency);
            setTotal(ocrDraft.total);
            setVatTotal(ocrDraft.vatTotal);
            setSubtotal(ocrDraft.subtotal);
            setItems(ocrDraft.items);
          }
        }

        updateJobRunning("job.step.ai", 0.55);
        if (aliveRef.current) {
          setProgress({ status: t("job.step.ai"), progress: 0.55 });
          setAiNote(null);
          setAiConfidence(null);
          setAiApplied(false);
        }

        const aiRes = await callExtractInvoice(ocrTextForApi, visionPayload);

        const baseForMerge = visionPayload ? emptyBaseDraft : ocrDraft;
        let merged = ocrDraft;
        let didAiApply = false;

        if (aiRes.ok) {
          didAiApply = true;
          merged = mergeAiOntoOcrDraft({ ocr: baseForMerge, ai: aiRes.data });
          if (aliveRef.current) {
            setAiApplied(true);
            setCustomerName(merged.customerName);
            setCustomerEmail(merged.customerEmail);
            setCustomerPhone(merged.customerPhone);
            setCustomerAddress(merged.customerAddress);
            setCustomerTaxNo(merged.customerTaxNo);
            setCustomerTaxOffice(merged.customerTaxOffice);
            setInvoiceNo(merged.invoiceNo);
            setIssueDate(merged.issueDate);
            setCurrency(merged.currency);
            setSubtotal(merged.subtotal);
            setVatTotal(merged.vatTotal);
            setTotal(merged.total);
            setItems(merged.items);
            setAiConfidence(typeof merged.confidence === "number" ? merged.confidence : null);
            const visionHint = visionPayload
              ? t("upload.aiNoteVision")
              : currentFile.type.toLowerCase().includes("heic") || currentFile.type.toLowerCase().includes("heif")
                ? t("upload.aiNoteHeic")
                : t("upload.aiNoteNoImg");
            setAiNote(
              typeof merged.confidence === "number"
                ? `${visionHint} ${t("upload.aiConfidenceSuffix").replace("{n}", String(Math.round(merged.confidence)))}`
                : visionHint,
            );
          }
        } else {
          didAiApply = false;
          if (visionPayload && !hadTesseractOcr) {
            const errMsg =
              aiRes.error.includes("OPENAI_API_KEY") || aiRes.error.includes("GEMINI_API_KEY")
                ? t("upload.aiKeyMissingShort")
                : aiRes.error;
            setInvoiceJob({
              status: "error",
              error: errMsg,
              finishedAt: Date.now(),
              fileName: currentFile.name,
            });
            if (aliveRef.current) {
              setAiApplied(false);
              setAiConfidence(null);
              setAiNote(errMsg);
              setError(errMsg);
              setReviewOpen(true);
              setProgress(null);
            }
            return;
          }
          merged = ocrDraft;
          if (aliveRef.current) {
            setAiApplied(false);
            setAiConfidence(null);
            setAiNote(
              aiRes.error.includes("OPENAI_API_KEY") || aiRes.error.includes("GEMINI_API_KEY")
                ? t("upload.aiKeyMissingLong")
                : aiRes.error,
            );
          }
        }

        const subN = toNum(merged.subtotal);
        const vatN = toNum(merged.vatTotal);
        const totN = toNum(merged.total);
        if (aliveRef.current) {
          setWarnings(
            computeWarnings({
              customerName: merged.customerName,
              issueDate: merged.issueDate,
              subtotal: subN,
              vatTotal: vatN,
              total: totN,
              items: merged.items,
            }),
          );
        }

        updateJobRunning("job.step.save", 0.95);
        if (aliveRef.current) {
          setProgress({ status: t("job.step.save"), progress: 0.95 });
        }
        try {
          const { invoiceId } = await persistUploadDraft({
            supabase: sb,
            userId: user.id,
            file: currentFile,
            draft: toUploadDraft(merged),
            aiApplied: didAiApply,
            aiConfidence: typeof merged.confidence === "number" ? merged.confidence : null,
          });
          setInvoiceJob({
            status: "ok",
            message: t("upload.doneLine"),
            finishedAt: Date.now(),
            fileName: currentFile.name,
            invoiceId,
          });
          appendImportHistory({
            fileName: currentFile.name,
            startedAt,
            finishedAt: Date.now(),
            status: "ok",
            detail: t("upload.historyOk"),
            invoiceId,
          });
          if (aliveRef.current) {
            setReviewOpen(false);
            setError(null);
            setMessage(t("upload.doneLine"));
            setFile(null);
            setProgress({ status: t("upload.progressDone"), progress: 1 });
          }
        } catch (persistErr: unknown) {
          if (persistErr instanceof DuplicateInvoiceError) {
            setInvoiceJob({
              status: "duplicate",
              message: persistErr.message,
              finishedAt: Date.now(),
              fileName: currentFile.name,
              existingInvoiceId: persistErr.existingInvoiceId,
            });
            appendImportHistory({
              fileName: currentFile.name,
              startedAt,
              finishedAt: Date.now(),
              status: "duplicate",
              detail: persistErr.message,
              invoiceId: persistErr.existingInvoiceId,
            });
            if (aliveRef.current) {
              setError(null);
              setMessage(t("upload.dupLine"));
              setReviewOpen(false);
              setFile(null);
              setProgress(null);
            }
            return;
          }
          const pe = persistErr instanceof Error ? persistErr.message : t("upload.saveFailed");
          setInvoiceJob({
            status: "error",
            error: pe,
            finishedAt: Date.now(),
            fileName: currentFile.name,
          });
          appendImportHistory({
            fileName: currentFile.name,
            startedAt,
            finishedAt: Date.now(),
            status: "error",
            detail: pe,
          });
          if (aliveRef.current) {
            setError(pe);
            setReviewOpen(true);
            setProgress(null);
          }
          return;
        }
        if (aliveRef.current) setProgress(null);
      } catch (err: any) {
        const msg = err?.message ?? t("upload.processFailed");
        setInvoiceJob({
          status: "error",
          error: msg,
          finishedAt: Date.now(),
          fileName: currentFile.name,
        });
        if (aliveRef.current) {
          setError(msg);
          setProgress(null);
        }
      }
    })();
  }

  async function saveApproved() {
    setError(null);
    setMessage(null);
    if (!supabase) return;
    if (!file) {
      setError(t("upload.fileLost"));
      return;
    }
    setBusy(true);
    setProgress({ status: t("upload.progressSaving"), progress: 0.8 });
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { invoiceId } = await persistUploadDraft({
        supabase,
        userId: user.id,
        file,
        draft: buildDraftFromState(),
        aiApplied,
        aiConfidence,
      });

      appendImportHistory({
        fileName: file.name,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        status: "ok",
        detail: t("upload.historyManual"),
        invoiceId,
      });
      setInvoiceJob({
        status: "ok",
        message: t("upload.doneLine"),
        finishedAt: Date.now(),
        fileName: file.name,
        invoiceId,
      });

      setProgress({ status: t("upload.progressDone"), progress: 1 });
      setMessage(t("upload.doneLine"));
      setFile(null);
      setReviewOpen(false);
    } catch (err: unknown) {
      if (err instanceof DuplicateInvoiceError) {
        appendImportHistory({
          fileName: file.name,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          status: "duplicate",
          detail: err.message,
          invoiceId: err.existingInvoiceId,
        });
        setInvoiceJob({
          status: "duplicate",
          message: err.message,
          finishedAt: Date.now(),
          fileName: file.name,
          existingInvoiceId: err.existingInvoiceId,
        });
        setMessage(t("upload.dupLine"));
        setProgress(null);
      } else {
        setError(err instanceof Error ? err.message : t("upload.saveFailed"));
        setProgress(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("upload.title")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("upload.intro")}</p>
        </div>
        <div className="flex gap-2">
          <a className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm" href="/app/invoices">
            {t("nav.invoices")}
          </a>
          <a className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm" href="/app/customers">
            {t("nav.suppliers")}
          </a>
        </div>
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--app-border)] bg-white p-6">
        <div>
          <label className="text-sm font-medium">{t("upload.fileLabel")}</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            type="file"
            accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-zinc-500">{t("upload.fileHint")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={process}
            disabled={!file || busy || backgroundRunning}
            className="rounded-xl bg-[var(--app-navy)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy || backgroundRunning ? t("upload.processing") : t("upload.btn")}
          </button>
          {progress ? (
            <span className="text-sm text-zinc-600">
              {progress.status} · %{Math.round((progress.progress ?? 0) * 100)}
            </span>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        {reviewOpen ? (
          <div className="mt-2 grid gap-4 rounded-2xl border bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t("upload.reviewTitle")}</p>
                <p className="mt-1 text-xs text-zinc-600">{t("upload.reviewHint")}</p>
              </div>
              <button
                type="button"
                onClick={saveApproved}
                disabled={busy}
                className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {t("upload.save")}
              </button>
            </div>

            {aiNote ? (
              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                <div className="font-medium">{t("upload.info")}</div>
                <p className="mt-2">{aiNote}</p>
              </div>
            ) : null}

            {warnings.length ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-medium">{t("upload.warnings")}</div>
                <ul className="mt-2 list-disc pl-5">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{t("upload.supplier")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.invoiceNo")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder={t("upload.optional")}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.date")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.ustId")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={customerTaxNo}
                  onChange={(e) => setCustomerTaxNo(e.target.value)}
                  placeholder={t("upload.optional")}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.email")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.phone")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.steuer")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={customerTaxOffice}
                  onChange={(e) => setCustomerTaxOffice(e.target.value)}
                  placeholder={t("upload.optional")}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">{t("upload.address")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium">{t("upload.currency")}</label>
                <select
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as any)}
                >
                  <option value="TRY">TRY</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.subtotal")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.vat")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={vatTotal}
                  onChange={(e) => setVatTotal(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("upload.total")}</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-white overflow-x-auto">
              <div className="border-b px-4 py-2 text-sm font-medium">{t("upload.linesTitle")}</div>
              <div className="min-w-[760px] divide-y">
                {items.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-zinc-600">{t("upload.noLines")}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-12 gap-2 bg-zinc-50 px-4 py-2 text-[11px] font-medium text-zinc-600">
                      <div className="col-span-1">{t("upload.colPos")}</div>
                      <div className="col-span-3">{t("upload.colDesc")}</div>
                      <div className="col-span-1 text-right">{t("upload.colQty")}</div>
                      <div className="col-span-1">{t("upload.colUnit")}</div>
                      <div className="col-span-2 text-right">{t("upload.colUnitPrice")}</div>
                      <div className="col-span-2 text-right">{t("upload.colLineTotal")}</div>
                      <div className="col-span-2 text-right"> </div>
                    </div>
                    {items.map((it, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-3">
                        <div className="col-span-1">
                          <input
                            className="w-full rounded-lg border px-2 py-2 text-sm outline-none focus:ring"
                            value={it.lineNo != null ? String(it.lineNo) : String(idx + 1)}
                            onChange={(e) => {
                              const next = [...items];
                              const v = Number(e.target.value.replace(",", "."));
                              next[idx] = { ...it, lineNo: Number.isFinite(v) ? v : undefined };
                              setItems(next);
                            }}
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
                            value={it.description}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...it, description: e.target.value };
                              setItems(next);
                            }}
                            placeholder={t("upload.phProduct")}
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            className="w-full rounded-xl border px-2 py-2 text-sm outline-none focus:ring text-right"
                            value={typeof it.quantity === "number" ? String(it.quantity) : ""}
                            onChange={(e) => {
                              const next = [...items];
                              const n = toNum(e.target.value);
                              next[idx] = { ...it, quantity: n };
                              setItems(next);
                            }}
                            placeholder={t("upload.phQty")}
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            className="w-full rounded-xl border px-2 py-2 text-sm outline-none focus:ring"
                            value={it.unit ?? ""}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = { ...it, unit: e.target.value };
                              setItems(next);
                            }}
                            placeholder="m²"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring text-right"
                            value={typeof it.unitPrice === "number" ? it.unitPrice.toFixed(2) : ""}
                            onChange={(e) => {
                              const next = [...items];
                              const n = toNum(e.target.value);
                              next[idx] = { ...it, unitPrice: n };
                              setItems(next);
                            }}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring text-right"
                            value={typeof it.lineTotal === "number" ? it.lineTotal.toFixed(2) : ""}
                            onChange={(e) => {
                              const next = [...items];
                              const n = toNum(e.target.value);
                              next[idx] = { ...it, lineTotal: n };
                              setItems(next);
                            }}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <button
                            type="button"
                            className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50"
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          >
                            {t("upload.del")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div className="border-t px-4 py-3">
                <button
                  type="button"
                  className="rounded-xl border bg-white px-4 py-2 text-sm hover:bg-zinc-50"
                  onClick={() => setItems([...items, { description: "" }])}
                >
                  {t("upload.addLine")}
                </button>
              </div>
            </div>

            <details className="rounded-2xl border bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("upload.ocrDebug")}</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">{ocrText}</pre>
            </details>
          </div>
        ) : null}

        <div className="rounded-xl border bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {t("upload.footerLinksHtml")}{" "}
          <a className="underline" href="/app/invoices">
            {t("nav.invoices")}
          </a>{" "}
          ·{" "}
          <a className="underline" href="/app/customers">
            {t("nav.suppliers")}
          </a>
        </div>
      </div>
    </div>
  );
}

