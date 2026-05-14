"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClientSafe, getSupabasePublicEnv } from "@/lib/supabase/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleContext";

function formatAuthError(err: unknown, t: (path: string) => string): string {
  const msg =
    err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : err instanceof Error
        ? err.message
        : "";
  const lower = msg.toLowerCase();
  if (msg === "Failed to fetch" || lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return t("login.networkError");
  }
  return msg || t("login.genericFail");
}

type AuthMode = "login" | "register";

export default function LoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const env = getSupabasePublicEnv();
  const { t, locale } = useI18n();
  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const bullets = t("login.bullets").split("|");

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
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (signErr) throw signErr;
      window.location.href = "/app";
    } catch (err: unknown) {
      setError(formatAuthError(err, t));
    } finally {
      setLoading(false);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!supabase) throw new Error(t("dashboard.envMissing"));
      const em = email.trim();
      const pw = password.trim();
      if (!em || !pw) throw new Error(t("login.fillAll"));
      if (pw.length < 6) throw new Error(t("login.passwordTooShort"));
      const { data, error: signErr } = await supabase.auth.signUp({ email: em, password: pw });
      if (signErr) throw signErr;
      if (data.session) {
        window.location.href = "/app";
        return;
      }
      setInfo(t("login.registerOkSignIn"));
    } catch (err: unknown) {
      setError(formatAuthError(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[var(--app-surface)] text-zinc-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12">
        <div className="mb-6 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--app-navy-muted)]">{brand}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--app-navy)]">{t("login.title")}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-600">{t("login.subtitle")}</p>
        </div>

        <div className="rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
          <div className="flex rounded-xl bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
                mode === "login" ? "bg-white text-[var(--app-navy)] shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {t("login.signInTitle")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
                mode === "register" ? "bg-white text-[var(--app-navy)] shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {t("login.tabRegister")}
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            {mode === "login" ? t("login.signInHint") : t("login.signUpHint")}
          </p>

          <form onSubmit={mode === "login" ? signIn : signUp} className="mt-5 space-y-4">
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
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
              <p className="mt-1 text-xs text-zinc-500">{t("login.passwordMinHint")}</p>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-700">{info}</p> : null}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-[var(--app-navy)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              type="submit"
            >
              {loading ? t("common.loading") : mode === "login" ? t("login.submit") : t("login.tabRegister")}
            </button>
          </form>

          {mode === "register" ? (
            <div className="mt-5 border-t border-[var(--app-border)] pt-4">
              <ul className="list-inside list-disc space-y-1.5 text-xs text-zinc-600">
                {bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-zinc-500">{t("login.registerFootnote")}</p>
            </div>
          ) : null}
        </div>

        {!env.ok ? <p className="mt-6 text-center text-xs text-zinc-500">{t("login.envHint")}</p> : null}

        <p className="mt-8 text-center text-sm text-zinc-500">
          <Link className="text-[var(--app-navy)] underline" href="/">
            {t("login.homeLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
