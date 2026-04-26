"use client";

export default function Home() {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Werbundo Muhasebe</h1>
          <a className="rounded-xl border bg-white px-4 py-2 text-sm" href="/login">
            Giriş
          </a>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="font-medium">Fatura Takibi</h2>
            <p className="mt-2 text-sm text-zinc-600">Tutar, KDV ve toplamları kayıt altına al.</p>
          </div>
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="font-medium">Dekont / Ödeme</h2>
            <p className="mt-2 text-sm text-zinc-600">Gelen ödemeleri dekont dosyasıyla kaydet.</p>
          </div>
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="font-medium">OCR (Yavaş olabilir)</h2>
            <p className="mt-2 text-sm text-zinc-600">Dosyadan alan önerir, sen düzeltip kaydedersin.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
