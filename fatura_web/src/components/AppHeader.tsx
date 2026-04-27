"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/LocaleContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppHeader() {
  const { t, locale } = useI18n();
  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");

  return (
    <header className="border-b border-[var(--app-border)] bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link className="font-semibold tracking-tight text-[var(--app-navy)]" href="/app">
          {brand}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <Link className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app">
              {t("nav.panel")}
            </Link>
            <Link
              className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-[var(--app-navy)] hover:bg-slate-200"
              href="/app/upload"
            >
              {t("nav.upload")}
            </Link>
            <Link className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/import-verlauf">
              {t("nav.history")}
            </Link>
            <Link className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/customers">
              {t("nav.suppliers")}
            </Link>
            <Link className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/invoices">
              {t("nav.invoices")}
            </Link>
            <Link className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/profil">
              {t("nav.account")}
            </Link>
          </nav>
          <LanguageSwitcher variant="compact" />
        </div>
      </div>
    </header>
  );
}
