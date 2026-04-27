"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe, getSupabasePublicEnv } from "@/lib/supabase/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleContext";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const env = getSupabasePublicEnv();
  const { t, locale } = useI18n();
  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");

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
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const em = email.trim();
      const pw = password.trim();
      if (!em || !pw) throw new Error(t("login.fillAll"));
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
      window.location.href = "/app";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const em = email.trim();
      const pw = password.trim();
      if (!em || !pw) throw new Error(t("login.fillAll"));
      const { error } = await supabase.auth.signUp({ email: em, password: pw });
      if (error) throw error;
      setInfo(t("login.registerOk"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  const bullets = t("login.bullets").split("|");

  return (
    <div className="min-h-dvh bg-[var(--app-surface)] text-zinc-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center px-6 py-12">
        <div className="mb-6 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--app-navy-muted)]">{brand}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--app-navy)]">{t("login.title")}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-600">{t("login.subtitle")}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <form
            onSubmit={signIn}
            className="rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-[var(--app-navy)]">{t("login.signInTitle")}</h2>
            <p className="mt-1 text-xs text-zinc-500">{t("login.signInHint")}</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-700">{t("login.email")}</label>
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none ring-[var(--app-navy)] focus:ring-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">{t("login.password")}</label>
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 outline-none ring-[var(--app-navy)] focus:ring-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            <button
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-[var(--app-navy)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              type="submit"
            >
              {loading ? "…" : t("login.submit")}
            </button>
          </form>

          <div className="rounded-2xl border border-dashed border-[var(--app-border)] bg-white/80 p-6">
            <h2 className="text-lg font-semibold text-[var(--app-navy)]">{t("login.signUpTitle")}</h2>
            <p className="mt-1 text-xs text-zinc-500">{t("login.signUpHint")}</p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-zinc-600">
              {bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <button
              disabled={loading}
              className="mt-6 w-full rounded-xl border-2 border-[var(--app-navy)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--app-navy)] disabled:opacity-50"
              type="button"
              onClick={() => void signUp()}
            >
              {t("login.register")}
            </button>
          </div>
        </div>

        {error ? <p className="mt-6 text-center text-sm text-red-600">{error}</p> : null}
        {info ? <p className="mt-6 text-center text-sm text-emerald-700">{info}</p> : null}

        {!env.ok ? <p className="mt-8 text-center text-xs text-zinc-500">{t("login.envHint")}</p> : null}

        <p className="mt-8 text-center text-sm text-zinc-500">
          <a className="text-[var(--app-navy)] underline" href="/">
            {t("login.homeLink")}
          </a>
        </p>
      </div>
    </div>
  );
}
