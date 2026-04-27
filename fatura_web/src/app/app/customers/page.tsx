"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/LocaleContext";

type CustomerRow = {
  id: string;
  name: string;
  tax_no: string | null;
  created_at: string;
};

export default function CustomersPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [name, setName] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dateLoc = locale === "de" ? "de-DE" : "tr-TR";

  async function load() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error: qErr } = await supabase
        .from("customers")
        .select("id,name,tax_no,created_at")
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      setCustomers((data ?? []) as CustomerRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("customers.loading"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        window.location.href = "/login";
        return;
      }

      const { error: insErr } = await supabase.from("customers").insert({
        user_id: userId,
        name: name.trim(),
        tax_no: taxNo.trim() || null,
      });
      if (insErr) throw insErr;

      setName("");
      setTaxNo("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  }

  async function removeCustomer(id: string) {
    if (!supabase) return;
    if (!window.confirm(t("customers.deleteConfirm"))) return;
    setDeletingId(id);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { error: delErr } = await supabase.from("customers").delete().eq("id", id).eq("user_id", uid);
      if (delErr) {
        const msg = String(delErr.message ?? "");
        if (/restrict|foreign|violates|23503/i.test(msg)) {
          setError(t("customers.deleteBlocked"));
          return;
        }
        throw delErr;
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("customers.deleteErr"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("customers.title")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("customers.subtitle")}</p>
        </div>
      </div>

      <form
        onSubmit={addCustomer}
        className="mt-6 grid gap-3 rounded-2xl border border-[var(--app-border)] bg-white p-5 md:grid-cols-3"
      >
        <div className="md:col-span-2">
          <label className="text-sm font-medium">{t("customers.name")}</label>
          <input
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">{t("customers.taxOptional")}</label>
          <input
            className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--app-navy)]"
            value={taxNo}
            onChange={(e) => setTaxNo(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <button
            className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white"
            type="submit"
          >
            {t("customers.add")}
          </button>
          {error ? <span className="ml-3 text-sm text-red-600">{error}</span> : null}
        </div>
      </form>

      <div className="mt-8 rounded-2xl border border-[var(--app-border)] bg-white">
        <div className="border-b border-[var(--app-border)] px-5 py-3 text-sm font-medium">{t("customers.list")}</div>
        <div className="divide-y divide-[var(--app-border)]">
          {loading ? (
            <div className="px-5 py-4 text-sm text-zinc-600">{t("customers.loading")}</div>
          ) : customers.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-600">{t("customers.empty")}</div>
          ) : (
            customers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <a className="font-medium text-[var(--app-navy)] hover:underline" href={`/app/customers/${c.id}`}>
                    {c.name}
                  </a>
                  <div className="mt-1 text-xs text-zinc-500">{c.tax_no ?? "—"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{new Date(c.created_at).toLocaleString(dateLoc)}</span>
                  <button
                    type="button"
                    disabled={deletingId === c.id}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-800 hover:bg-red-100 disabled:opacity-50"
                    onClick={() => void removeCustomer(c.id)}
                  >
                    {deletingId === c.id ? "…" : t("customers.delete")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
