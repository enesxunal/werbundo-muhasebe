"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleContext";

export function LandingSaaS() {
  const { t, locale } = useI18n();
  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");

  const bullets = t("login.bullets").split("|");

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-semibold text-[var(--app-navy)]">{brand}</span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="compact" />
            <Link
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-slate-50"
              href="/login"
            >
              {t("landing.navLogin")}
            </Link>
            <Link
              className="rounded-xl bg-[var(--app-navy)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--app-navy-muted)]"
              href="/login"
            >
              {t("landing.navStart")}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[var(--app-border)] bg-gradient-to-b from-slate-50 to-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(30,58,95,0.12),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 md:pb-28 md:pt-24">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-navy-muted)]">
            {t("landing.badge")}
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-center text-4xl font-semibold tracking-tight text-[var(--app-navy)] md:text-5xl md:leading-tight">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-zinc-600">
            {t("landing.heroSub")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              className="inline-flex rounded-xl bg-[var(--app-navy)] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-[var(--app-navy-muted)]"
              href="/login"
            >
              {t("landing.ctaSecondary")}
            </Link>
            <Link
              className="inline-flex rounded-xl border-2 border-[var(--app-navy)] bg-white px-8 py-3.5 text-sm font-semibold text-[var(--app-navy)] hover:bg-slate-50"
              href="/login"
            >
              {t("landing.ctaPrimary")}
            </Link>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-3 gap-6 border-y border-[var(--app-border)] py-8 md:gap-10">
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--app-navy)] md:text-3xl">OCR + KI</p>
              <p className="mt-1 text-xs text-zinc-500">{locale === "de" ? "Einlesen" : "Okuma"}</p>
            </div>
            <div className="text-center border-x border-[var(--app-border)]">
              <p className="text-2xl font-bold text-[var(--app-navy)] md:text-3xl">DE · TR</p>
              <p className="mt-1 text-xs text-zinc-500">{locale === "de" ? "Sprachen" : "Diller"}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[var(--app-navy)] md:text-3xl">RLS</p>
              <p className="mt-1 text-xs text-zinc-500">{locale === "de" ? "Sicher" : "Güvenli"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[var(--app-navy-muted)]">
          {t("landing.sectionFeatures")}
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: t("landing.feat1Title"), desc: t("landing.feat1Desc"), icon: "⚡" },
            { title: t("landing.feat2Title"), desc: t("landing.feat2Desc"), icon: "📊" },
            { title: t("landing.feat3Title"), desc: t("landing.feat3Desc"), icon: "🔁" },
            { title: t("landing.feat4Title"), desc: t("landing.feat4Desc"), icon: "🔒" },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="mt-4 font-semibold text-[var(--app-navy)]">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--app-border)] bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[var(--app-navy-muted)]">
            {t("landing.sectionHow")}
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { step: "1", text: t("landing.how1") },
              { step: "2", text: t("landing.how2") },
              { step: "3", text: t("landing.how3") },
            ].map((x) => (
              <div key={x.step} className="flex gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[var(--app-border)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--app-navy)] text-sm font-bold text-white">
                  {x.step}
                </span>
                <p className="text-sm leading-relaxed text-zinc-700">{x.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl bg-[var(--app-navy)] px-8 py-12 text-center text-white md:px-16">
          <p className="text-lg font-medium opacity-95">{t("landing.heroSub").slice(0, 120)}…</p>
          <Link
            className="mt-8 inline-flex rounded-xl bg-white px-8 py-3 text-sm font-semibold text-[var(--app-navy)] hover:bg-slate-100"
            href="/login"
          >
            {t("landing.ctaSecondary")}
          </Link>
        </div>
        <ul className="mx-auto mt-10 max-w-md space-y-2 text-sm text-zinc-600">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-emerald-600">✓</span>
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-12 text-center text-xs text-zinc-500">{t("landing.footerNote")}</p>
      </section>
    </div>
  );
}
