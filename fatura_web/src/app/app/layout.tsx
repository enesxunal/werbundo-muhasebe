import { InvoiceJobBanner } from "@/components/InvoiceJobBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a className="font-semibold tracking-tight" href="/app">
            Werbundo
          </a>
          <nav className="flex items-center gap-3 text-sm">
            <a className="rounded-lg bg-zinc-100 px-3 py-2 hover:bg-zinc-200" href="/app/upload">
              Fotoğraf Yükle
            </a>
            <a className="rounded-lg px-3 py-2 hover:bg-zinc-100" href="/app/customers">
              Müşteriler
            </a>
            <a className="rounded-lg px-3 py-2 hover:bg-zinc-100" href="/app/invoices">
              Faturalar
            </a>
            <a className="rounded-lg px-3 py-2 hover:bg-zinc-100" href="/login">
              Çıkış / Giriş
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-6 py-8 pb-24">{children}</main>
      <InvoiceJobBanner />
    </div>
  );
}

