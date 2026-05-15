"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/LocaleContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function navClass(active: boolean) {
  return active
    ? "rounded-lg bg-[var(--app-navy)] px-3 py-2 text-sm font-medium text-white"
    : "rounded-lg px-3 py-2 text-sm text-[var(--app-navy)] hover:bg-slate-100";
}

export function AppHeader() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const primary = [
    { href: "/app", label: t("nav.panel") },
    { href: "/app/upload", label: t("nav.upload") },
    { href: "/app/reconciliation", label: t("nav.reconciliation") },
  ];

  const secondary = [
    { href: "/app/invoices", label: t("nav.invoices") },
    { href: "/app/customers", label: t("nav.suppliers") },
    { href: "/app/correspondence", label: t("nav.correspondence") },
    { href: "/app/import-verlauf", label: t("nav.history") },
  ];

  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);

  const moreActive = secondary.some((l) => isActive(l.href));

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link className="shrink-0 font-semibold tracking-tight text-[var(--app-navy)]" href="/app">
          {brand}
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {primary.map((l) => (
            <Link key={l.href} href={l.href} className={navClass(isActive(l.href))}>
              {l.label}
            </Link>
          ))}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={navClass(moreActive)}
              aria-expanded={moreOpen}
            >
              {t("nav.more")} ▾
            </button>
            {moreOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-xl border border-[var(--app-border)] bg-white py-1 shadow-lg">
                {secondary.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block px-4 py-2.5 text-sm hover:bg-slate-50 ${
                      isActive(l.href) ? "font-medium text-[var(--app-navy)]" : "text-zinc-700"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher variant="compact" />
          <Link
            href="/app/profil"
            className={`hidden rounded-lg px-3 py-2 text-sm sm:inline-flex ${
              isActive("/app/profil")
                ? "bg-slate-100 font-medium text-[var(--app-navy)]"
                : "text-zinc-600 hover:bg-slate-50"
            }`}
          >
            {t("nav.account")}
          </Link>
          <button
            type="button"
            className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-navy)] md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t("nav.menu")}
          >
            ☰
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav className="border-t border-[var(--app-border)] px-4 py-3 md:hidden">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{t("nav.workflow")}</p>
          <div className="grid gap-1">
            {primary.map((l) => (
              <Link key={l.href} href={l.href} className={navClass(isActive(l.href))}>
                {l.label}
              </Link>
            ))}
          </div>
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{t("nav.records")}</p>
          <div className="grid gap-1">
            {secondary.map((l) => (
              <Link key={l.href} href={l.href} className={navClass(isActive(l.href))}>
                {l.label}
              </Link>
            ))}
            <Link href="/app/profil" className={navClass(isActive("/app/profil"))}>
              {t("nav.account")}
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
