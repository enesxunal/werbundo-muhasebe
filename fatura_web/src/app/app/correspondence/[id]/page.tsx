"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { getSignedDocumentUrl } from "@/lib/upload/documents";
import { useI18n } from "@/lib/i18n/LocaleContext";

type Row = {
  id: string;
  category: string;
  issuer_name: string | null;
  summary: string | null;
  deadline_date: string | null;
  response_deadline_date: string | null;
  amount: number | null;
  reference_no: string | null;
  ocr_text: string | null;
  completed_at: string | null;
  saved_reply: string | null;
  reply_lang: string | null;
  parent_id: string | null;
  followup_thread: string | null;
  document_id: string | null;
  customer: { name: string } | null;
  document: { storage_path: string; storage_bucket: string; original_filename: string | null } | null;
};

export default function CorrespondenceDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);

  const [row, setRow] = useState<Row | null>(null);
  const [parentThread, setParentThread] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedReply, setSavedReply] = useState("");
  const [replyLang, setReplyLang] = useState("de");
  const [additionalIncoming, setAdditionalIncoming] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyAddress, setCompanyAddress] = useState<string | null>(null);

  const dateLoc = locale === "de" ? "de-DE" : "tr-TR";

  async function load() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        window.location.href = "/login";
        return;
      }
      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;
      const cn = String(meta.company_name ?? "").trim();
      const ca = [String(meta.company_address ?? "").trim(), String(meta.company_city ?? "").trim()]
        .filter(Boolean)
        .join(", ");
      setCompanyName(cn || null);
      setCompanyAddress(ca || null);

      const { data, error: qErr } = await supabase
        .from("correspondence")
        .select(
          `
          id,category,issuer_name,summary,deadline_date,response_deadline_date,amount,reference_no,ocr_text,
          completed_at,saved_reply,reply_lang,parent_id,followup_thread,document_id,
          customer:customers(name),
          document:documents(storage_path,storage_bucket,original_filename)
        `,
        )
        .eq("id", id)
        .single();
      if (qErr) throw qErr;
      const r = data as unknown as Row;
      setRow(r);
      setSavedReply(r.saved_reply ?? "");
      setReplyLang(r.reply_lang ?? "de");

      if (r.parent_id) {
        const { data: pr } = await supabase
          .from("correspondence")
          .select("followup_thread")
          .eq("id", r.parent_id)
          .single();
        setParentThread((pr as { followup_thread?: string | null } | null)?.followup_thread ?? null);
      } else {
        setParentThread(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function catLabel(key: string): string {
    const tr = t(`correspondence.cat.${key}`);
    return tr === `correspondence.cat.${key}` ? key : tr;
  }

  async function toggleDone() {
    if (!supabase || !row) return;
    const next = row.completed_at ? null : new Date().toISOString();
    const { error: uErr } = await supabase
      .from("correspondence")
      .update({ completed_at: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    await load();
  }

  async function saveReply() {
    if (!supabase || !row) return;
    setError(null);
    try {
      const { error: uErr } = await supabase
        .from("correspondence")
        .update({
          saved_reply: savedReply.trim() || null,
          reply_lang: replyLang,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (uErr) throw uErr;
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function generateReply() {
    if (!row) return;
    setGenBusy(true);
    setError(null);
    try {
      const ocrSummary = [row.summary, row.ocr_text?.slice(0, 8000)].filter(Boolean).join("\n\n---\n");
      const resp = await fetch("/api/generate-correspondence-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replyLang,
          ocrSummary,
          issuerName: row.issuer_name ?? row.customer?.name ?? null,
          referenceNo: row.reference_no,
          companyName,
          companyAddress,
          priorSavedReply: savedReply.trim() || null,
          additionalIncoming: additionalIncoming.trim() || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) throw new Error(String(json?.error ?? t("correspondence.genFail")));
      setSavedReply(String(json.reply ?? ""));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setGenBusy(false);
    }
  }

  async function openDoc() {
    if (!row?.document?.storage_path) return;
    try {
      const url = await getSignedDocumentUrl({ path: row.document.storage_path });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError(t("correspondence.openDocFail"));
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-600">{t("common.loading")}</div>;
  }
  if (!row) {
    return (
      <div>
        <p className="text-sm text-red-600">{error ?? t("correspondence.notFound")}</p>
        <Link href="/app/correspondence" className="mt-4 inline-block text-sm text-[var(--app-navy)]">
          {t("correspondence.backList")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("correspondence.detailTitle")}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {catLabel(row.category)}
            {row.customer?.name || row.issuer_name
              ? ` · ${row.customer?.name ?? row.issuer_name}`
              : ""}
          </p>
        </div>
        <Link className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm" href="/app/correspondence">
          {t("correspondence.backList")}
        </Link>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}

      {row.parent_id ? (
        <div className="mt-4 rounded-2xl border border-[var(--app-border)] bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {t("correspondence.hasParent")}{" "}
          <Link className="font-medium underline" href={`/app/correspondence/${row.parent_id}`}>
            {t("correspondence.openParent")}
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--app-border)] bg-white p-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800">
            <input type="checkbox" checked={Boolean(row.completed_at)} onChange={() => void toggleDone()} />
            {t("correspondence.markDone")}
          </label>
          {row.document ? (
            <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => void openDoc()}>
              {t("correspondence.openScan")}
            </button>
          ) : null}
        </div>

        {row.summary ? (
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">{t("correspondence.summary")}</p>
            <p className="mt-1 text-sm text-zinc-800">{row.summary}</p>
          </div>
        ) : null}

        <div className="grid gap-2 text-sm text-zinc-700 md:grid-cols-2">
          {row.deadline_date ? (
            <div>
              <span className="text-zinc-500">{t("correspondence.deadline")}: </span>
              {new Date(row.deadline_date + "T12:00:00").toLocaleDateString(dateLoc)}
            </div>
          ) : null}
          {row.response_deadline_date ? (
            <div>
              <span className="text-zinc-500">{t("correspondence.responseDeadline")}: </span>
              {new Date(row.response_deadline_date + "T12:00:00").toLocaleDateString(dateLoc)}
            </div>
          ) : null}
          {row.reference_no ? (
            <div>
              <span className="text-zinc-500">{t("correspondence.reference")}: </span>
              {row.reference_no}
            </div>
          ) : null}
          {row.amount != null ? (
            <div>
              <span className="text-zinc-500">{t("correspondence.amount")}: </span>
              {row.amount}
            </div>
          ) : null}
        </div>

        {parentThread ? (
          <div className="rounded-xl border border-[var(--app-border)] bg-slate-50 p-4">
            <p className="text-xs font-medium text-zinc-600">{t("correspondence.followupChain")}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{parentThread}</pre>
          </div>
        ) : null}

        {row.followup_thread && !row.parent_id ? (
          <div className="rounded-xl border border-[var(--app-border)] bg-slate-50 p-4">
            <p className="text-xs font-medium text-zinc-600">{t("correspondence.followupChain")}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{row.followup_thread}</pre>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--app-navy)]">{t("correspondence.replySection")}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t("correspondence.replyHint")}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">{t("correspondence.replyLang")}</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={replyLang}
              onChange={(e) => setReplyLang(e.target.value)}
            >
              <option value="de">Deutsch</option>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">{t("correspondence.additionalIncoming")}</label>
          <textarea
            className="mt-1 min-h-[72px] w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
            placeholder={t("correspondence.additionalIncomingPh")}
            value={additionalIncoming}
            onChange={(e) => setAdditionalIncoming(e.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={genBusy}
            className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void generateReply()}
          >
            {genBusy ? "…" : t("correspondence.genReply")}
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm"
            onClick={() => void generateReply()}
          >
            {t("correspondence.regenerate")}
          </button>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium">{t("correspondence.draft")}</label>
          <textarea
            className="mt-1 min-h-[200px] w-full rounded-xl border px-3 py-2 font-mono text-sm outline-none focus:ring"
            value={savedReply}
            onChange={(e) => setSavedReply(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="mt-3 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium text-white"
          onClick={() => void saveReply()}
        >
          {t("correspondence.saveDraft")}
        </button>
      </div>
    </div>
  );
}
