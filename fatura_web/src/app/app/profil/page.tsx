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

  const [companyName, setCompanyName] = useState("");
  const [companyTaxNo, setCompanyTaxNo] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileOk, setProfileOk] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      setEmail(u?.email ?? null);
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      setCompanyName(String(meta.company_name ?? ""));
      setCompanyTaxNo(String(meta.company_tax_no ?? ""));
      setCompanyAddress(String(meta.company_address ?? ""));
      setCompanyCity(String(meta.company_city ?? ""));
      setLoading(false);
    })();
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function saveCompany() {
    if (!supabase) return;
    setProfileBusy(true);
    setProfileOk(false);
    setProfileErr(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          company_name: companyName.trim(),
          company_tax_no: companyTaxNo.trim(),
          company_address: companyAddress.trim(),
          company_city: companyCity.trim(),
        },
      });
      if (error) throw error;
      setProfileOk(true);
    } catch (e: unknown) {
      setProfileErr(e instanceof Error ? e.message : "—");
    } finally {
      setProfileBusy(false);
    }
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

        <div className="mt-8 border-t border-[var(--app-border)] pt-6">
          <p className="text-sm font-semibold text-[var(--app-navy)]">{t("profile.companySection")}</p>
          <p className="mt-1 text-xs text-zinc-500">{t("profile.companyHint")}</p>

          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-600">{t("profile.companyName")}</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">{t("profile.companyTaxNo")}</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring"
                value={companyTaxNo}
                onChange={(e) => setCompanyTaxNo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">{t("profile.companyCity")}</label>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring"
                value={companyCity}
                onChange={(e) => setCompanyCity(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">{t("profile.companyAddress")}</label>
              <textarea
                rows={2}
                className="mt-1 w-full resize-y rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:ring"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={profileBusy || !supabase}
            onClick={() => void saveCompany()}
            className="mt-4 rounded-xl bg-[var(--app-navy)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {profileBusy ? t("profile.companySaving") : t("profile.companySave")}
          </button>
          {profileOk ? <p className="mt-2 text-xs text-emerald-800">{t("profile.companySaved")}</p> : null}
          {profileErr ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {profileErr}
            </p>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--app-border)] pt-6">
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
