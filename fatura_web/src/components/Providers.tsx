"use client";

import { LocaleProvider } from "@/lib/i18n/LocaleContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
