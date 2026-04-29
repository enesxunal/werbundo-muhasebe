"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/LocaleContext";

type Row = {
  id: string;
  category: string;
  summary: string | null;
  deadline_date: string | null;
  completed_at: string | null;
  issuer_name: string | null;
  created_at: string;
  customer: { name: string } | null;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (24 * 3600 * 1000));
}

export default function CorrespondenceListPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

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

      const { data, error: qErr } = await supabase
        .from("correspondence")
        .select("id,category,summary,deadline_date,completed_at,issuer_name,created_at,customer:customers(name)")
        .order("created_at", { ascending: false });

      if (qErr) throw qErr;
      setRows((data ?? []) as unknown as Row[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = showDone ? rows : rows.filter((r) => !r.completed_at);
    list = [...list].sort((a, b) => {
      if (!showDone) {
        const ac = a.completed_at ? 1 : 0;
        const bc = b.completed_at ? 1 : 0;
        if (ac !== bc) return ac - bc;
      }
      const ad = a.deadline_date ?? "9999-12-31";
      const bd = b.deadline_date ?? "9999-12-31";
      return ad.localeCompare(bd);
    });
    return list;
  }, [rows, showDone]);

  function catLabel(key: string): string {
    const k = `correspondence.cat.${key}` as const;
    const tr = t(k);
    return tr === k ? key : tr;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("correspondence.title")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("correspondence.subtitle")}</p>
        </div>
        <Link
          className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white"
          href="/app/correspondence/new"
        >
          {t("correspondence.new")}
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t("correspondence.showCompleted")}
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-white">
        <div className="border-b border-[var(--app-border)] px-5 py-3 text-sm font-medium">
          {t("correspondence.list")} ({filtered.length})
        </div>
        <div className="divide-y divide-[var(--app-border)]">
          {loading ? (
            <div className="px-5 py-4 text-sm text-zinc-600">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-600">{t("correspondence.empty")}</div>
          ) : (
            filtered.map((r) => {
              const du = daysUntil(r.deadline_date);
              const name =
                r.customer?.name?.trim() ||
                r.issuer_name?.trim() ||
                (locale === "de" ? "Unbekannt" : "Belirtilmedi");
              return (
                <Link
                  key={r.id}
                  href={`/app/correspondence/${r.id}`}
                  className="flex flex-col gap-1 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900">{name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {catLabel(r.category)}
                      {r.deadline_date
                        ? ` · ${t("correspondence.deadline")}: ${new Date(r.deadline_date + "T12:00:00").toLocaleDateString(dateLoc)}`
                        : ""}
                      {r.completed_at ? (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">{t("correspondence.done")}</span>
                      ) : du !== null && r.deadline_date ? (
                        <span className={`ml-2 ${du <= 7 ? "font-medium text-amber-700" : "text-zinc-600"}`}>
                          ·{" "}
                          {du < 0
                            ? t("correspondence.overdueDays").replace("{n}", String(Math.abs(du)))
                            : t("correspondence.daysLeft").replace("{n}", String(du))}
                        </span>
                      ) : null}
                    </div>
                    {r.summary ? <div className="mt-2 line-clamp-2 text-sm text-zinc-700">{r.summary}</div> : null}
                  </div>
                  <div className="text-xs text-zinc-400">{new Date(r.created_at).toLocaleString(dateLoc)}</div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
