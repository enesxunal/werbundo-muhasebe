"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe, getSupabasePublicEnv } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const env = getSupabasePublicEnv();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
      const em = email.trim();
      const pw = password.trim();
      if (!em || !pw) throw new Error("Email ve şifre boş olamaz.");
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
      window.location.href = "/app";
    } catch (err: any) {
      setError(err?.message ?? "Giriş başarısız.");
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error("Supabase ayarları eksik. `.env.local` dosyasını doldurun.");
      const em = email.trim();
      const pw = password.trim();
      if (!em || !pw) throw new Error("Email ve şifre boş olamaz.");
      const { error } = await supabase.auth.signUp({ email: em, password: pw });
      if (error) throw error;
      setInfo("Kayıt oluşturuldu. Email doğrulaması gerekiyorsa mailinizi kontrol edin.");
    } catch (err: any) {
      setError(err?.message ?? "Kayıt başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Werbundo Muhasebe</h1>
        <p className="mt-2 text-sm text-zinc-600">Giriş yap veya hesap oluştur.</p>

        <form onSubmit={signIn} className="mt-8 space-y-4 rounded-2xl border bg-white p-6">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Şifre</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-700">{info}</p> : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
            type="submit"
          >
            Giriş Yap
          </button>

          <button
            disabled={loading}
            className="w-full rounded-xl border px-4 py-2 disabled:opacity-50"
            type="button"
            onClick={signUp}
          >
            Hesap Oluştur
          </button>
        </form>

        {!env.ok ? (
          <p className="mt-6 text-xs text-zinc-500">
            Bağlantı için `.env.local` oluşturup `.env.example` içindeki değerleri doldurun.
          </p>
        ) : null}
      </div>
    </div>
  );
}

