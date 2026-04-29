"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe, getSupabasePublicEnv } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/LocaleContext";
import Link from "next/link";
import { dictionaries, translate, type Locale } from "@/lib/i18n/dictionaries";

type MonthBucket = {
  key: string; // YYYY-MM
  label: string; // TR label
  total: number;
  vatTotal: number;
  count: number;
};

type TopRow = { label: string; total: number };

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string, locale: Locale): string {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(locale === "de" ? "de-DE" : "tr-TR", { month: "short", year: "numeric" });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function normalizeCategory(desc: string): string {
  const t = (desc ?? "").toString().trim().replace(/\s+/g, " ");
  if (!t) return "Diğer";
  // çok uzun/karmaşık açıklamayı kısa bir başlık haline getir
  const parts = t.split(" ");
  const short = parts.slice(0, Math.min(3, parts.length)).join(" ");
  return short.length > 28 ? `${short.slice(0, 28)}…` : short;
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const env = getSupabasePublicEnv();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [thisMonthTotal, setThisMonthTotal] = useState<number | null>(null);
  const [thisMonthVat, setThisMonthVat] = useState<number | null>(null);
  const [thisMonthCount, setThisMonthCount] = useState<number | null>(null);
  const [excludedOtherCurrencyCount, setExcludedOtherCurrencyCount] = useState<number | null>(null);
  const [topCustomers, setTopCustomers] = useState<TopRow[]>([]);
  const [topCategories, setTopCategories] = useState<TopRow[]>([]);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderErr, setReminderErr] = useState<string | null>(null);
  const [unpaidInvoices, setUnpaidInvoices] = useState<
    { id: string; days: number; label: string; total: number; currency: string }[]
  >([]);
  const [dueLetters, setDueLetters] = useState<
    { id: string; days: number; label: string; summary: string | null }[]
  >([]);

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      setLoading(false);
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const unkSupplier = translate(dictionaries[locale], "invoices.supplier");
      setStatsError(null);
      setMonths([]);
      setThisMonthTotal(null);
      setThisMonthVat(null);
      setThisMonthCount(null);
      setExcludedOtherCurrencyCount(null);
      setTopCustomers([]);
      setTopCategories([]);

      if (!env.ok || !supabase) return;

      setStatsLoading(true);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;

        const DISPLAY_CURRENCY = "EUR";

        const now = new Date();
        const from = addMonths(startOfMonth(now), -5);
        const to = addMonths(startOfMonth(now), 1);
        const fromIso = from.toISOString().slice(0, 10);
        const toIso = to.toISOString().slice(0, 10);
        const thisMonthKey = monthKey(now);

        // 1) Son 6 ay faturalar
        const { data: invRows, error: invErr } = await supabase
          .from("invoices")
          .select("id,issue_date,total,vat_total,currency,customer:customers(name)")
          .gte("issue_date", fromIso)
          .lt("issue_date", toIso)
          .order("issue_date", { ascending: false });
        if (invErr) throw invErr;

        const buckets = new Map<string, MonthBucket>();
        for (let i = 0; i < 6; i++) {
          const d = addMonths(startOfMonth(now), -i);
          const key = monthKey(d);
          buckets.set(key, { key, label: monthLabel(key, locale), total: 0, vatTotal: 0, count: 0 });
        }

        const customerAgg = new Map<string, number>();
        const thisMonthIds: string[] = [];
        let excluded = 0;

        for (const r of invRows ?? []) {
          const issue = new Date(String((r as any).issue_date));
          if (Number.isNaN(issue.getTime())) continue;
          const key = monthKey(issue);
          const b = buckets.get(key);
          if (!b) continue;

          const ccy = String((r as any).currency ?? "TRY").toUpperCase();
          if (ccy !== DISPLAY_CURRENCY) {
            excluded += 1;
            continue;
          }

          const t = asNumber((r as any).total);
          const v = asNumber((r as any).vat_total);
          b.total += t;
          b.vatTotal += v;
          b.count += 1;

          if (key === thisMonthKey) {
            const cid = String((r as any).id ?? "");
            if (cid) thisMonthIds.push(cid);
            const custName = String((r as any).customer?.name ?? "").trim() || unkSupplier;
            customerAgg.set(custName, (customerAgg.get(custName) ?? 0) + t);
          }
        }

        const monthList = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
        setMonths(monthList);

        const thisB = buckets.get(thisMonthKey) ?? null;
        setThisMonthTotal(thisB ? thisB.total : 0);
        setThisMonthVat(thisB ? thisB.vatTotal : 0);
        setThisMonthCount(thisB ? thisB.count : 0);
        setExcludedOtherCurrencyCount(excluded);

        setTopCustomers(
          Array.from(customerAgg.entries())
            .map(([label, total]) => ({ label, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5),
        );

        // 2) Bu ay “en çok nereye harcanmış”: kalem açıklamalarından kategori çıkar
        if (thisMonthIds.length) {
          const { data: itemRows, error: itemErr } = await supabase
            .from("invoice_items")
            .select("description,line_total,quantity,unit_price,invoice_id")
            .in("invoice_id", thisMonthIds);
          if (itemErr) throw itemErr;

          const catAgg = new Map<string, number>();
          for (const it of itemRows ?? []) {
            const desc = String((it as any).description ?? "");
            const cat = normalizeCategory(desc);
            const lt = asNumber((it as any).line_total);
            const q = asNumber((it as any).quantity);
            const up = asNumber((it as any).unit_price);
            const amount = lt > 0 ? lt : q > 0 && up > 0 ? q * up : 0;
            if (amount <= 0) continue;
            catAgg.set(cat, (catAgg.get(cat) ?? 0) + amount);
          }
          setTopCategories(
            Array.from(catAgg.entries())
              .map(([label, total]) => ({ label, total }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 7),
          );
        }
      } catch (e: unknown) {
        setStatsError(e instanceof Error ? e.message : translate(dictionaries[locale], "dashboard.statsErr"));
      } finally {
        setStatsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.ok, supabase, locale]);

  useEffect(() => {
    (async () => {
      setReminderErr(null);
      setUnpaidInvoices([]);
      setDueLetters([]);
      if (!env.ok || !supabase) return;
      setReminderLoading(true);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;

        const today = new Date();
        today.setHours(12, 0, 0, 0);

        const { data: invData, error: invErr } = await supabase
          .from("invoices")
          .select("id,issue_date,total,currency,customer:customers(name)")
          .is("paid_at", null)
          .order("issue_date", { ascending: true });
        if (invErr) throw invErr;

        const invRows = (invData ?? []) as unknown as {
          id: string;
          issue_date: string;
          total: number;
          currency: string;
          customer: { name: string } | null;
        }[];

        const unpaid = invRows
          .map((r) => {
            const d = new Date(String(r.issue_date) + "T12:00:00");
            const days = Math.floor((today.getTime() - d.getTime()) / (24 * 3600 * 1000));
            const label = String(r.customer?.name ?? "").trim() || translate(dictionaries[locale], "invoices.supplier");
            return {
              id: r.id,
              days,
              label,
              total: asNumber(r.total),
              currency: String(r.currency ?? "EUR"),
            };
          })
          .sort((a, b) => b.days - a.days);
        setUnpaidInvoices(unpaid.slice(0, 8));

        const { data: corrData, error: corrErr } = await supabase
          .from("correspondence")
          .select("id,deadline_date,summary,issuer_name,customer:customers(name)")
          .is("completed_at", null)
          .not("deadline_date", "is", null)
          .order("deadline_date", { ascending: true });
        if (corrErr) throw corrErr;

        const letters = (corrData ?? []) as unknown as {
          id: string;
          deadline_date: string;
          summary: string | null;
          issuer_name: string | null;
          customer: { name: string } | null;
        }[];

        const due = letters
          .map((r) => {
            const dl = new Date(r.deadline_date + "T12:00:00");
            const days = Math.floor((dl.getTime() - today.getTime()) / (24 * 3600 * 1000));
            const label =
              String(r.customer?.name ?? "").trim() || String(r.issuer_name ?? "").trim() || "—";
            return { id: r.id, days, label, summary: r.summary };
          })
          .filter((x) => x.days <= 14);
        setDueLetters(due.slice(0, 8));
      } catch (e: unknown) {
        setReminderErr(e instanceof Error ? e.message : translate(dictionaries[locale], "dashboard.statsErr"));
      } finally {
        setReminderLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.ok, supabase, locale]);

  const currencyFmt = useMemo(() => {
    try {
      return new Intl.NumberFormat(locale === "de" ? "de-DE" : "tr-TR", {
        style: "currency",
        currency: "EUR",
      });
    } catch {
      return null;
    }
  }, [locale]);

  const fmtMoney = (n: number | null) => {
    const v = typeof n === "number" ? n : 0;
    return currencyFmt ? currencyFmt.format(v) : `${v.toFixed(2)} ₺`;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("dashboard.title")}</h1>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600">
          {!env.ok
            ? t("dashboard.envMissing")
            : loading
              ? t("dashboard.loading")
              : email
                ? `${t("dashboard.loginLine")}: ${email}`
                : t("dashboard.notSignedIn")}
        </p>
        {!env.ok ? null : !loading && !email ? (
          <a
            className="inline-flex w-fit items-center justify-center rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm text-white"
            href="/login"
          >
            {t("dashboard.signInBtn")}
          </a>
        ) : null}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-5">
          <p className="text-xs text-zinc-500">{t("dashboard.monthTotal")}</p>
          <p className="mt-2 text-xl font-semibold">{statsLoading ? t("dashboard.loading") : fmtMoney(thisMonthTotal)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {thisMonthCount == null ? "—" : `${thisMonthCount} ${t("dashboard.invoicesCount")}`}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-5">
          <p className="text-xs text-zinc-500">{t("dashboard.monthVat")}</p>
          <p className="mt-2 text-xl font-semibold">{statsLoading ? t("dashboard.loading") : fmtMoney(thisMonthVat)}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("dashboard.vatNote")}</p>
        </div>
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-5">
          <p className="text-xs text-zinc-500">{t("dashboard.topSpend")}</p>
          <p className="mt-2 text-xl font-semibold">
            {statsLoading ? t("dashboard.loading") : topCustomers[0] ? topCustomers[0].label : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {statsLoading ? " " : topCustomers[0] ? fmtMoney(topCustomers[0].total) : " "}
          </p>
        </div>
      </div>

      {statsError ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {statsError}
        </div>
      ) : null}

      <div className="mt-8 rounded-2xl border border-[var(--app-border)] bg-white p-5">
        <p className="text-sm font-medium text-[var(--app-navy)]">{t("dashboard.remindersTitle")}</p>
        <p className="mt-1 text-xs text-zinc-500">{t("dashboard.remindersSub")}</p>
        {reminderErr ? (
          <p className="mt-3 text-sm text-amber-800">
            {reminderErr}{" "}
            <span className="text-zinc-600">
              (Veritabanında “paid_at” veya “correspondence” yoksa Supabase’de migration_v2.sql çalıştırın.)
            </span>
          </p>
        ) : null}
        {reminderLoading ? (
          <p className="mt-4 text-sm text-zinc-600">{t("dashboard.loading")}</p>
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-zinc-600">{t("dashboard.unpaidInvoices")}</p>
              <div className="mt-2 grid gap-2">
                {unpaidInvoices.length === 0 ? (
                  <p className="text-sm text-zinc-600">{t("dashboard.noUnpaid")}</p>
                ) : (
                  unpaidInvoices.map((r) => (
                    <Link
                      key={r.id}
                      href={`/app/invoices/${r.id}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0 text-zinc-800">
                        {r.label} · {r.total.toFixed(2)} {r.currency}
                      </span>
                      <span className="shrink-0 text-xs text-amber-800">
                        {t("dashboard.daysSinceInvoice").replace("{n}", String(r.days))}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-600">{t("dashboard.dueLetters")}</p>
              <div className="mt-2 grid gap-2">
                {dueLetters.length === 0 ? (
                  <p className="text-sm text-zinc-600">{t("dashboard.noDueSoon")}</p>
                ) : (
                  dueLetters.map((r) => (
                    <Link
                      key={r.id}
                      href={`/app/correspondence/${r.id}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0 text-zinc-800">{r.label}</span>
                      <span className={`shrink-0 text-xs ${r.days < 0 ? "text-red-700" : "text-amber-800"}`}>
                        {r.days < 0
                          ? t("dashboard.overdueLetter").replace("{n}", String(Math.abs(r.days)))
                          : t("dashboard.daysLeftLetter").replace("{n}", String(r.days))}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {excludedOtherCurrencyCount && excludedOtherCurrencyCount > 0 ? (
        <div className="mt-4 rounded-2xl border border-[var(--app-border)] bg-white px-4 py-3 text-sm text-zinc-700">
          {t("dashboard.eurOnlyNote")}{" "}
          <span className="font-medium">EUR</span> · {excludedOtherCurrencyCount} {t("dashboard.excluded")}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("dashboard.trendTitle")}</p>
              <p className="mt-1 text-xs text-zinc-500">{t("dashboard.trendSub")}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            {months.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-700">{m.label}</span>
                <span className="font-medium">{fmtMoney(m.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-5">
          <p className="text-sm font-medium">{t("dashboard.spendTitle")}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("dashboard.spendSub")}</p>

          <div className="mt-4 grid gap-5">
            <div>
              <p className="text-xs font-medium text-zinc-600">{t("dashboard.bySupplier")}</p>
              <div className="mt-2 grid gap-2">
                {topCustomers.length ? (
                  topCustomers.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">{r.label}</span>
                      <span className="font-medium">{fmtMoney(r.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-600">{statsLoading ? t("dashboard.loading") : t("dashboard.noInvoicesThisMonth")}</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-600">{t("dashboard.byCategory")}</p>
              <div className="mt-2 grid gap-2">
                {topCategories.length ? (
                  topCategories.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">{r.label}</span>
                      <span className="font-medium">{fmtMoney(r.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-600">{statsLoading ? t("dashboard.loading") : t("dashboard.noItems")}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

