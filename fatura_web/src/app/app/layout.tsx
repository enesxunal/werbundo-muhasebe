import { InvoiceJobBanner } from "@/components/InvoiceJobBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--app-surface)] text-zinc-900">
      <header className="border-b border-[var(--app-border)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <a className="font-semibold tracking-tight text-[var(--app-navy)]" href="/app">
            Rechnungsverfolgung
          </a>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <a className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app">
              Panel
            </a>
            <a
              className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-[var(--app-navy)] hover:bg-slate-200"
              href="/app/upload"
            >
              Fatura yükle
            </a>
            <a className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/import-verlauf">
              Yükleme geçmişi
            </a>
            <a className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/customers">
              Tedarikçiler
            </a>
            <a className="rounded-lg px-3 py-2 text-[var(--app-navy)] hover:bg-slate-100" href="/app/invoices">
              Faturalar
            </a>
            <a className="rounded-lg px-3 py-2 text-zinc-500 hover:bg-slate-100" href="/login">
              Hesap
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-6 py-8 pb-28">{children}</main>
      <InvoiceJobBanner />
    </div>
  );
}
