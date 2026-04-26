"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe, getSupabasePublicEnv } from "@/lib/supabase/client";

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

function monthLabelTr(key: string): string {
  const [y, m] = key.split("-");
  const monthNo = Number(m);
  const names = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const mn = monthNo >= 1 && monthNo <= 12 ? names[monthNo - 1] : m;
  return `${mn} ${y}`;
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
          buckets.set(key, { key, label: monthLabelTr(key), total: 0, vatTotal: 0, count: 0 });
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
            const custName = String((r as any).customer?.name ?? "").trim() || "Bilinmeyen müşteri";
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
      } catch (e: any) {
        setStatsError(e?.message ?? "İstatistik yüklenemedi.");
      } finally {
        setStatsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env.ok, supabase]);

  const currencyFmt = useMemo(() => {
    try {
      return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR" });
    } catch {
      return null;
    }
  }, []);

  const fmtMoney = (n: number | null) => {
    const v = typeof n === "number" ? n : 0;
    return currencyFmt ? currencyFmt.format(v) : `${v.toFixed(2)} ₺`;
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-600">
          {!env.ok
            ? "Bağlantı ayarları eksik. `.env.local` dosyasını doldurun."
            : loading
              ? "Yükleniyor..."
              : email
                ? `Giriş: ${email}`
                : "Giriş yapılmamış."}
        </p>
        {!env.ok ? null : !loading && !email ? (
          <a className="inline-flex w-fit items-center justify-center rounded-xl bg-black px-4 py-2 text-sm text-white" href="/login">
            Giriş Yap
          </a>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Hızlı işlem</p>
            <p className="mt-1 text-sm text-zinc-600">Sadece fotoğraf yükle, sistem otomatik kaydetsin.</p>
          </div>
          <a className="rounded-xl bg-black px-4 py-2 text-sm text-white" href="/app/upload">
            Fotoğraf Yükle
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-xs text-zinc-500">Bu ay toplam</p>
          <p className="mt-2 text-xl font-semibold">{statsLoading ? "Yükleniyor..." : fmtMoney(thisMonthTotal)}</p>
          <p className="mt-1 text-xs text-zinc-500">{thisMonthCount == null ? "—" : `${thisMonthCount} fatura`}</p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-xs text-zinc-500">Bu ay KDV toplamı</p>
          <p className="mt-2 text-xl font-semibold">{statsLoading ? "Yükleniyor..." : fmtMoney(thisMonthVat)}</p>
          <p className="mt-1 text-xs text-zinc-500">KDV alanı boş olan faturalar dahil olmayabilir</p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-xs text-zinc-500">En çok harcama (bu ay)</p>
          <p className="mt-2 text-xl font-semibold">
            {statsLoading ? "Yükleniyor..." : topCustomers[0] ? topCustomers[0].label : "—"}
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
      {excludedOtherCurrencyCount && excludedOtherCurrencyCount > 0 ? (
        <div className="mt-4 rounded-2xl border bg-white px-4 py-3 text-sm text-zinc-700">
          Not: İstatistikler şu an sadece <span className="font-medium">EUR</span> faturalarını topluyor.{" "}
          {excludedOtherCurrencyCount} adet farklı para birimli fatura hariç tutuldu.
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Aylık trend (son 6 ay)</p>
              <p className="mt-1 text-xs text-zinc-500">Toplam fatura tutarı</p>
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

        <div className="rounded-2xl border bg-white p-5">
          <p className="text-sm font-medium">En çok nereye harcanmış? (bu ay)</p>
          <p className="mt-1 text-xs text-zinc-500">Kalem açıklamalarından otomatik gruplanır</p>

          <div className="mt-4 grid gap-5">
            <div>
              <p className="text-xs font-medium text-zinc-600">Müşteriye göre</p>
              <div className="mt-2 grid gap-2">
                {topCustomers.length ? (
                  topCustomers.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">{r.label}</span>
                      <span className="font-medium">{fmtMoney(r.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-600">{statsLoading ? "Yükleniyor..." : "Bu ay fatura yok."}</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-600">Kalem kategorisine göre</p>
              <div className="mt-2 grid gap-2">
                {topCategories.length ? (
                  topCategories.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">{r.label}</span>
                      <span className="font-medium">{fmtMoney(r.total)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-600">
                    {statsLoading ? "Yükleniyor..." : "Bu ay kalem detayı yok (veya tutar alanları boş)."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

