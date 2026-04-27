"use client";

import type { Locale } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/LocaleContext";

export function LanguageSwitcher({ variant = "default" }: { variant?: "default" | "compact" }) {
  const { locale, setLocale, t } = useI18n();

  const base =
    variant === "compact"
      ? "rounded-lg border border-[var(--app-border)] bg-white px-2 py-1 text-xs outline-none"
      : "rounded-xl border border-[var(--app-border)] bg-white px-4 py-2 text-sm outline-none";

  return (
    <select
      className={base}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label={t("profile.language")}
    >
      <option value="tr">{t("profile.langTr")}</option>
      <option value="de">{t("profile.langDe")}</option>
    </select>
  );
}
