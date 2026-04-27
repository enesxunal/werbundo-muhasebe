import { InvoiceJobBanner } from "@/components/InvoiceJobBanner";
import { AppHeader } from "@/components/AppHeader";
import { FloatingAssistant } from "@/components/FloatingAssistant";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--app-surface)] text-zinc-900">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-6 py-8 pb-28">{children}</main>
      <InvoiceJobBanner />
      <FloatingAssistant />
    </div>
  );
}
