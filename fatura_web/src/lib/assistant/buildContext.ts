export type InvoiceRow = {
  issue_date: string;
  total: number | null;
  vat_total: number | null;
  currency: string | null;
  invoice_no: string | null;
  customer?: { name: string | null } | Array<{ name: string | null }> | null;
};

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function supplierName(row: InvoiceRow): string {
  const c = row.customer;
  if (!c) return "";
  if (Array.isArray(c)) return String(c[0]?.name ?? "").trim();
  return String(c.name ?? "").trim();
}

function monthKey(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function buildAssistantContext(args: {
  locale: "tr" | "de";
  company: {
    name: string;
    taxNo: string;
    address: string;
    city: string;
  };
  invoices: InvoiceRow[];
}): string {
  const { locale, company, invoices } = args;
  const lines: string[] = [];

  lines.push(locale === "de" ? "=== PROFIL (INHABER) ===" : "=== PROFİL (HESAP SAHİBİ) ===");
  if (company.name || company.taxNo || company.address || company.city) {
    if (company.name) lines.push(locale === "de" ? `Firma: ${company.name}` : `Firma: ${company.name}`);
    if (company.taxNo) lines.push(locale === "de" ? `USt-IdNr./Steuer-Nr.: ${company.taxNo}` : `Vergi no: ${company.taxNo}`);
    if (company.address) lines.push(locale === "de" ? `Adresse: ${company.address}` : `Adres: ${company.address}`);
    if (company.city) lines.push(locale === "de" ? `Ort: ${company.city}` : `Şehir: ${company.city}`);
  } else {
    lines.push(locale === "de" ? "(Keine Firmendaten im Profil.)" : "(Profilde firma bilgisi yok.)");
  }

  const eurMonthly = new Map<string, number>();
  const eurVatMonthly = new Map<string, number>();
  const supplierTotals = new Map<string, number>();
  let countEur = 0;
  let sumEur = 0;
  let sumVatEur = 0;
  const otherCounts = new Map<string, number>();

  for (const inv of invoices) {
    const ccy = String(inv.currency ?? "EUR").toUpperCase();
    const total = asNum(inv.total);
    const vat = asNum(inv.vat_total);
    const mk = monthKey(inv.issue_date);

    if (ccy === "EUR") {
      countEur += 1;
      sumEur += total;
      sumVatEur += vat;
      if (mk) {
        eurMonthly.set(mk, (eurMonthly.get(mk) ?? 0) + total);
        eurVatMonthly.set(mk, (eurVatMonthly.get(mk) ?? 0) + vat);
      }
      const sn = supplierName(inv) || (locale === "de" ? "Unbekannt" : "Bilinmeyen");
      supplierTotals.set(sn, (supplierTotals.get(sn) ?? 0) + total);
    } else {
      otherCounts.set(ccy, (otherCounts.get(ccy) ?? 0) + 1);
    }
  }

  lines.push("");
  lines.push(locale === "de" ? "=== ÜBERSICHT (EUR-Rechnungen, Auswahlzeitraum) ===" : "=== ÖZET (EUR faturalar, seçilen aralık) ===");
  lines.push(locale === "de" ? `Anzahl EUR-Rechnungen: ${countEur}` : `EUR fatura adedi: ${countEur}`);
  lines.push(locale === "de" ? `Summe EUR (Brutto): ${sumEur.toFixed(2)}` : `EUR toplam (brüt): ${sumEur.toFixed(2)}`);
  lines.push(locale === "de" ? `Summe USt (EUR): ${sumVatEur.toFixed(2)}` : `KDV / USt toplamı (EUR): ${sumVatEur.toFixed(2)}`);

  if (otherCounts.size) {
    lines.push(
      locale === "de"
        ? `Andere Währungen (Anzahl je Währung): ${Array.from(otherCounts.entries())
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")}`
        : `Diğer para birimleri (adet): ${Array.from(otherCounts.entries())
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")}`,
    );
  }

  const months = Array.from(eurMonthly.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (months.length) {
    lines.push("");
    lines.push(locale === "de" ? "=== Monatssummen (EUR, Brutto) ===" : "=== Aylık toplamlar (EUR, brüt) ===");
    for (const [k, v] of months) {
      const uv = eurVatMonthly.get(k) ?? 0;
      lines.push(`${k}: ${v.toFixed(2)} EUR (USt: ${uv.toFixed(2)})`);
    }
  }

  const topSup = Array.from(supplierTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (topSup.length) {
    lines.push("");
    lines.push(locale === "de" ? "=== Top-Lieferanten (Summe EUR, Zeitraum) ===" : "=== En çok ödenen tedarikçiler (EUR toplamı) ===");
    for (const [name, t] of topSup) {
      lines.push(`${name}: ${t.toFixed(2)} EUR`);
    }
  }

  const recent = [...invoices]
    .sort((a, b) => String(b.issue_date).localeCompare(String(a.issue_date)))
    .slice(0, 35);
  if (recent.length) {
    lines.push("");
    lines.push(locale === "de" ? "=== Letzte Rechnungen (Auszug) ===" : "=== Son faturalar (özet) ===");
    for (const r of recent) {
      const ccy = String(r.currency ?? "").toUpperCase();
      const sup = supplierName(r) || "—";
      const no = r.invoice_no ? String(r.invoice_no) : "—";
      lines.push(
        `${r.issue_date} | ${sup} | ${asNum(r.total).toFixed(2)} ${ccy} | Nr.${no}`,
      );
    }
  }

  lines.push("");
  lines.push(
    locale === "de"
      ? "Antworte nur auf Basis dieser Daten. Wenn etwas fehlt, sag das klar. Keine erfundenen Zahlen."
      : "Yanıtları yalnızca bu verilere dayandır. Eksik bilgi varsa söyle; rakam uydurma.",
  );

  return lines.join("\n");
}
