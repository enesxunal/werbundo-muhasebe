"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { runInvoiceOcr } from "@/lib/ocr/runOcr";
import { uploadDocument } from "@/lib/upload/documents";
import { prepareInvoiceImageForVision } from "@/lib/vision/prepareInvoiceImageForVision";
import { useI18n } from "@/lib/i18n/LocaleContext";
import type { AiCorrespondenceExtract, CorrespondenceCategory } from "@/lib/correspondence/types";

type CustomerRow = { id: string; name: string };
type ParentHint = { id: string; reference_no: string | null; summary: string | null };

const CATEGORIES: CorrespondenceCategory[] = [
  "official_letter",
  "fine",
  "payment_notice",
  "compliance",
  "other",
];

export default function CorrespondenceNewPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ status: string; progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [parentRows, setParentRows] = useState<ParentHint[]>([]);

  const [ocrText, setOcrText] = useState("");
  const [category, setCategory] = useState<CorrespondenceCategory>("official_letter");
  const [issuerName, setIssuerName] = useState("");
  const [summary, setSummary] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [responseDeadlineDate, setResponseDeadlineDate] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [parentId, setParentId] = useState("");
  const [aiAppendNote, setAiAppendNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        window.location.href = "/login";
        return;
      }
      const uid = u.user.id;

      const { data: c } = await supabase.from("customers").select("id,name").order("name", { ascending: true });
      setCustomers((c ?? []) as CustomerRow[]);

      const { data: p } = await supabase
        .from("correspondence")
        .select("id,reference_no,summary")
        .eq("user_id", uid)
        .is("completed_at", null)
        .order("created_at", { ascending: false })
        .limit(40);
      setParentRows((p ?? []) as ParentHint[]);
    })();
  }, [supabase]);

  function catLabel(key: string): string {
    const tr = t(`correspondence.cat.${key}`);
    return tr === `correspondence.cat.${key}` ? key : tr;
  }

  async function runExtract() {
    if (!file || !supabase) return;
    setError(null);
    setBusy(true);
    setProgress({ status: "ocr", progress: 0.05 });
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Oturum yok.");

      const ocr = await runInvoiceOcr({
        file,
        onProgress: (p) => setProgress(p),
      });
      setOcrText(ocr.text);

      const vision = await prepareInvoiceImageForVision(file);
      setProgress({ status: "ai", progress: 0.55 });

      const resp = await fetch("/api/extract-correspondence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ocrText: ocr.text,
          ...(vision ? { imageBase64: vision.imageBase64, mimeType: vision.mimeType } : {}),
          parentHints: parentRows.map((x) => ({
            id: x.id,
            reference_no: x.reference_no,
            summary: x.summary,
          })),
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        throw new Error(String(json?.error ?? t("correspondence.extractFail")));
      }

      const d = json.data as AiCorrespondenceExtract;
      setCategory(d.category);
      if (d.issuer_name) setIssuerName(d.issuer_name);
      if (d.summary) setSummary(d.summary);
      if (d.deadline_date) setDeadlineDate(d.deadline_date);
      if (d.response_deadline_date) setResponseDeadlineDate(d.response_deadline_date);
      if (d.reference_no) setReferenceNo(d.reference_no);
      if (typeof d.amount === "number") setAmount(String(d.amount));
      if (d.suggested_parent_id && parentRows.some((p) => p.id === d.suggested_parent_id)) {
        setParentId(d.suggested_parent_id);
      }
      setAiAppendNote(d.append_note_for_parent ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function toNum(v: string): number | null {
    const n = Number(v.replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !supabase) return;
    setError(null);
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("Oturum yok.");

      const doc = await uploadDocument({ file, userId: user.id, docType: "correspondence" });

      const pid = parentId || null;
      const appendNote = pid ? aiAppendNote : null;

      const ins = {
        user_id: user.id,
        document_id: doc.id,
        category,
        issuer_name: issuerName.trim() || null,
        summary: summary.trim() || null,
        deadline_date: deadlineDate || null,
        response_deadline_date: responseDeadlineDate || null,
        amount: toNum(amount) != null ? Number(toNum(amount)!.toFixed(2)) : null,
        reference_no: referenceNo.trim() || null,
        ocr_text: ocrText.slice(0, 120000) || null,
        customer_id: customerId || null,
        parent_id: pid,
      };

      const { data: row, error: insErr } = await supabase.from("correspondence").insert(ins).select("id").single();
      if (insErr) throw insErr;

      if (pid && appendNote?.trim()) {
        const { data: prev } = await supabase.from("correspondence").select("followup_thread").eq("id", pid).single();
        const prevT = (prev as { followup_thread?: string | null })?.followup_thread ?? "";
        const merged = [prevT.trim(), appendNote.trim()].filter(Boolean).join("\n\n---\n");
        await supabase.from("correspondence").update({ followup_thread: merged, updated_at: new Date().toISOString() }).eq("id", pid);
      }

      window.location.href = `/app/correspondence/${row.id}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("correspondence.newTitle")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("correspondence.newIntro")}</p>
        </div>
        <Link className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm" href="/app/correspondence">
          {t("correspondence.backList")}
        </Link>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-white p-5">
        <label className="text-sm font-medium">{t("correspondence.fileLabel")}</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-2 block w-full text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setOcrText("");
          }}
        />
        <p className="mt-2 text-xs text-zinc-500">{t("correspondence.fileHint")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!file || busy}
            className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void runExtract()}
          >
            {busy ? t("correspondence.processing") : t("correspondence.readAi")}
          </button>
        </div>

        {progress ? (
          <p className="mt-3 text-xs text-zinc-600">
            {Math.round(progress.progress * 100)}% · {progress.status}
          </p>
        ) : null}
      </div>

      <form onSubmit={save} className="mt-6 grid max-w-3xl gap-4 rounded-2xl border border-[var(--app-border)] bg-white p-6">
        <div>
          <label className="text-sm font-medium">{t("correspondence.category")}</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={category}
            onChange={(e) => setCategory(e.target.value as CorrespondenceCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {catLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">{t("correspondence.counterparty")}</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">{t("correspondence.noCounterparty")}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-zinc-500">{t("correspondence.issuerHint")}</p>
          <input
            className="mt-2 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={issuerName}
            onChange={(e) => setIssuerName(e.target.value)}
            placeholder={locale === "de" ? "Behörde / Absender" : "Kurum / gönderen"}
          />
        </div>

        <div>
          <label className="text-sm font-medium">{t("correspondence.linkParent")}</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">{t("correspondence.noParent")}</option>
            {parentRows.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.reference_no ?? p.id.slice(0, 8)) + (p.summary ? ` — ${p.summary.slice(0, 40)}…` : "")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">{t("correspondence.summary")}</label>
          <textarea
            className="mt-1 min-h-[88px] w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">{t("correspondence.deadline")}</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("correspondence.responseDeadline")}</label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={responseDeadlineDate}
              onChange={(e) => setResponseDeadlineDate(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">{t("correspondence.reference")}</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("correspondence.amount")}</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "…" : t("correspondence.save")}
        </button>
      </form>
    </div>
  );
}
