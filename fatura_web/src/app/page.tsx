"use client";

export default function Home() {
  return (
    <div className="min-h-dvh bg-[var(--app-surface)] text-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="flex flex-col gap-6 border-b border-[var(--app-border)] pb-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--app-navy-muted)]">
              Rechnungsverfolgung
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-navy)]">
              Gelen faturalar ve ön vergi özeti
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Tedarikçilerden gelen ticari faturaları (Almanya düzeni: net, KDV, genel toplam) tek yerde toplayın.
              Satır bazında harcamaları görün; işletmenize özel KDV / Vorsteuer tutarlarını takip edin.
            </p>
          </div>
          <a
            className="inline-flex h-fit items-center justify-center rounded-xl bg-[var(--app-navy)] px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-[var(--app-navy-muted)]"
            href="/login"
          >
            Giriş yap
          </a>
        </header>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--app-navy)]">Fatura yükleme</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Görsel yükleyin; sistem alanları okur, kaydı oluşturur. İsterseniz düzenleyip doğrulayın.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--app-navy)]">Tedarikçi bazlı</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Her tedarikçi için faturalar ve dönemsel harcama özeti. Karışık firmalarda bile düzenli takip.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--app-navy)]">Raporlama</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Ay ve tutara göre filtreleyin; fatura tarihi veya yükleme zamanına göre sıralayın.
            </p>
          </div>
        </div>

        <p className="mt-12 text-center text-xs text-zinc-500">
          Veriler hesabınıza özeldir; kayıt için giriş gerekir.
        </p>
      </div>
    </div>
  );
}
