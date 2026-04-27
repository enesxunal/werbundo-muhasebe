"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClientSafe } from "@/lib/supabase/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleContext";

export default function ProfilPage() {
  const { t, locale } = useI18n();
  const supabase = useMemo(() => createSupabaseBrowserClientSafe(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-navy)]">{t("profile.title")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("profile.subtitle")}</p>
        </div>
        <Link className="rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm" href="/app">
          {t("profile.back")}
        </Link>
      </div>

      <div className="mt-8 max-w-lg rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("profile.signedInAs")}</p>
        <p className="mt-2 text-lg font-medium text-zinc-900">{loading ? "…" : email ?? "—"}</p>

        <div className="mt-8 border-t border-[var(--app-border)] pt-6">
          <label className="text-sm font-medium text-zinc-700">{t("profile.language")}</label>
          <div className="mt-2">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {t("profile.signOut")}
          </button>
          <Link className="rounded-xl border border-[var(--app-border)] px-5 py-2.5 text-sm" href="/login">
            {t("landing.navLogin")}
          </Link>
        </div>

        <p className="mt-6 text-xs text-zinc-500">{brand}</p>
      </div>
    </div>
  );
}
