"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";

type CustomerRow = {
  id: string;
  name: string;
  tax_no: string | null;
  created_at: string;
};

export default function CustomersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [name, setName] = useState("");
  const [taxNo, setTaxNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .select("id,name,tax_no,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCustomers((data ?? []) as CustomerRow[]);
    } catch (err: any) {
      setError(err?.message ?? "Liste yüklenemedi.");
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
      if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        window.location.href = "/login";
        return;
      }

      const { error } = await supabase.from("customers").insert({
        user_id: userId,
        name: name.trim(),
        tax_no: taxNo.trim() || null,
      });
      if (error) throw error;

      setName("");
      setTaxNo("");
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Eklenemedi.");
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">Tedarikçiler</h1>
          <p className="mt-2 text-sm text-zinc-600">Faturayı düzenleyen firmalar (Lieferanten).</p>
        </div>
      </div>

      <form onSubmit={addCustomer} className="mt-6 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="text-sm font-medium">Tedarikçi adı</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn: ACME LTD ŞTİ"
            required
          />
        </div>
        <div>
          <label className="text-sm font-medium">Vergi No (opsiyonel)</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            value={taxNo}
            onChange={(e) => setTaxNo(e.target.value)}
            placeholder="1234567890"
          />
        </div>
        <div className="md:col-span-3">
          <button className="rounded-xl bg-black px-4 py-2 text-sm text-white" type="submit">
            Ekle
          </button>
          {error ? <span className="ml-3 text-sm text-red-600">{error}</span> : null}
        </div>
      </form>

      <div className="mt-8 rounded-2xl border bg-white">
        <div className="border-b px-5 py-3 text-sm font-medium">Liste</div>
        <div className="divide-y">
          {loading ? (
            <div className="px-5 py-4 text-sm text-zinc-600">Yükleniyor...</div>
          ) : customers.length === 0 ? (
            <div className="px-5 py-4 text-sm text-zinc-600">Henüz kayıt yok.</div>
          ) : (
            customers.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <a className="font-medium hover:underline" href={`/app/customers/${c.id}`}>
                    {c.name}
                  </a>
                  <div className="mt-1 text-xs text-zinc-500">
                    {c.tax_no ? `Vergi No: ${c.tax_no}` : "Vergi No: —"}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">{new Date(c.created_at).toLocaleString("tr-TR")}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

