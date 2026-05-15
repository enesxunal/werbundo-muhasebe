"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/LocaleContext";

export function LandingSaaS() {
  const { t, locale } = useI18n();
  const brand = locale === "de" ? "Rechnungsverfolgung" : t("brand");

  const features = [
    { title: t("landing.feat1Title"), desc: t("landing.feat1Desc"), icon: "📄" },
    { title: t("landing.feat2Title"), desc: t("landing.feat2Desc"), icon: "🏦" },
    { title: t("landing.feat3Title"), desc: t("landing.feat3Desc"), icon: "📊" },
    { title: t("landing.feat4Title"), desc: t("landing.feat4Desc"), icon: "✉️" },
    { title: t("landing.feat5Title"), desc: t("landing.feat5Desc"), icon: "🔒" },
  ];

  const steps = [
    { step: "1", text: t("landing.how1") },
    { step: "2", text: t("landing.how2") },
    { step: "3", text: t("landing.how3") },
  ];

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-semibold text-[var(--app-navy)]">{brand}</span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="compact" />
            <Link className="hidden rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-slate-50 sm:inline-flex" href="/login">
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
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-14 md:pb-24 md:pt-20">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-navy-muted)]">
            {t("landing.badge")}
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-center text-3xl font-semibold tracking-tight text-[var(--app-navy)] md:text-5xl md:leading-tight">
            {t("landing.heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-zinc-600 md:text-lg">
            {t("landing.heroSub")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              className="inline-flex rounded-xl bg-[var(--app-navy)] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-[var(--app-navy-muted)]"
              href="/login"
            >
              {t("landing.ctaPrimary")}
            </Link>
            <Link
              className="inline-flex rounded-xl border-2 border-[var(--app-navy)] bg-white px-7 py-3 text-sm font-semibold text-[var(--app-navy)] hover:bg-slate-50"
              href="/login"
            >
              {t("landing.ctaSecondary")}
            </Link>
          </div>
          <div className="mx-auto mt-12 flex max-w-2xl flex-wrap justify-center gap-2 text-center text-xs text-zinc-600">
            <span className="rounded-full border border-[var(--app-border)] bg-white px-3 py-1">OCR + KI</span>
            <span className="rounded-full border border-[var(--app-border)] bg-white px-3 py-1">Sparkasse PDF</span>
            <span className="rounded-full border border-[var(--app-border)] bg-white px-3 py-1">DE · TR</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[var(--app-navy-muted)]">
          {t("landing.sectionHow")}
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((x) => (
            <div key={x.step} className="flex gap-4 rounded-2xl border border-[var(--app-border)] bg-white p-5 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-navy)] text-sm font-bold text-white">
                {x.step}
              </span>
              <p className="text-sm leading-relaxed text-zinc-700">{x.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--app-border)] bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-[var(--app-navy-muted)]">
            {t("landing.sectionFeatures")}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-[var(--app-border)] bg-white p-5 shadow-sm"
              >
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-3 font-semibold text-[var(--app-navy)]">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-3xl bg-[var(--app-navy)] px-8 py-10 text-center text-white md:px-14">
          <h2 className="text-xl font-semibold md:text-2xl">{t("landing.heroTitle")}</h2>
          <Link
            className="mt-6 inline-flex rounded-xl bg-white px-8 py-3 text-sm font-semibold text-[var(--app-navy)] hover:bg-slate-100"
            href="/login"
          >
            {t("landing.ctaPrimary")}
          </Link>
        </div>
        <p className="mt-8 text-center text-xs text-zinc-500">{t("landing.footerNote")}</p>
      </section>
    </div>
  );
}
