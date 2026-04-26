export type OcrExtract = {
  rawText: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  issueDateISO?: string; // YYYY-MM-DD
  total?: number;
  vatTotal?: number;
  currency?: "TRY" | "USD" | "EUR";
  items?: Array<{
    lineNo?: number;
    description: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    lineTotal?: number;
  }>;
};

function normalizeText(s: string) {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[₺]/g, "TRY")
    .replace(/[€]/g, "EUR")
    .replace(/[$]/g, "USD");
}

function parseMoney(input: string): number | undefined {
  // "1.234,56" / "1234.56" / "1 234,56"
  const cleaned = input.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function toISODate(day: number, month: number, year: number): string | undefined {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return;
  if (day < 1 || day > 31) return;
  const d = new Date(Date.UTC(year, month - 1, day));
  // hızlı doğrulama
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function extractDate(text: string): string | undefined {
  // Önce "Tarih" geçen satırlarda ara
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const dateLike = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;
  for (const ln of lines) {
    if (!/(tarih|düzenleme|rechnungsdatum|datum)/i.test(ln)) continue;
    const m = ln.match(dateLike);
    if (m) return toISODate(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // Sonra genel metinde
  const m = text.match(dateLike);
  if (m) return toISODate(Number(m[1]), Number(m[2]), Number(m[3]));
  return;
}

function extractCurrency(text: string): OcrExtract["currency"] | undefined {
  const t = text.toUpperCase();
  if (t.includes("EUR")) return "EUR";
  if (t.includes("USD")) return "USD";
  if (t.includes("TRY") || t.includes("TL")) return "TRY";
  return;
}

function extractEmail(text: string): string | undefined {
  const m = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m?.[0]?.trim();
}

function extractPhone(text: string): string | undefined {
  const m = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  const val = m?.[1]?.replace(/\s+/g, " ").trim();
  if (!val) return;
  if (val.replace(/\D/g, "").length < 8) return;
  return val;
}

function extractAddress(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => /(adres|address)/i.test(l));
  if (idx >= 0) {
    const chunk = lines.slice(idx, idx + 4).join(" ");
    const cleaned = chunk.replace(/^(adres|address)\s*[:\-]?\s*/i, "").trim();
    return cleaned.length >= 8 ? cleaned : undefined;
  }
  const zipIdx = lines.findIndex((l) => /\b\d{5}\b/.test(l));
  if (zipIdx > 0) {
    const chunk = [lines[zipIdx - 1], lines[zipIdx]].join(" ");
    return chunk.length >= 8 ? chunk : undefined;
  }
  return;
}

function extractItems(text: string, currency: OcrExtract["currency"]): OcrExtract["items"] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: NonNullable<OcrExtract["items"]> = [];
  const moneyRe = /(-?\d[\d\s.]*[.,]\d{2})/g;

  for (const ln of lines) {
    if (/(zwischensumme|gesamtbetrag|genel\s*toplam|toplam|kdv|mwst|tax|summe)/i.test(ln)) continue;
    const ms = Array.from(ln.matchAll(moneyRe))
      .map((m) => parseMoney(m[1]))
      .filter((n): n is number => typeof n === "number");
    if (ms.length === 0) continue;

    if (ms.length >= 2) {
      const unitPrice = ms[ms.length - 2];
      const lineTotal = ms[ms.length - 1];
      const before = ln.split(moneyRe)[0].trim();
      const desc = before.replace(/^\d+\s+/, "").trim();
      if (desc.length < 3) continue;
      items.push({ description: desc, unitPrice, lineTotal });
      continue;
    }

    if (
      ms.length === 1 &&
      (currency ? ln.toUpperCase().includes(currency) : /EUR|USD|TRY|TL/.test(ln.toUpperCase()))
    ) {
      const amt = ms[0];
      const before = ln.split(moneyRe)[0].trim();
      const desc = before.replace(/^\d+\s+/, "").trim();
      if (desc.length < 3) continue;
      items.push({ description: desc, lineTotal: amt });
    }
  }

  items.forEach((it, idx) => (it.lineNo = idx + 1));
  return items.length ? items : undefined;
}

function cleanCustomerName(name: string): string | undefined {
  const n = name
    .replace(/\s+/g, " ")
    .replace(/[:\-]+/g, " ")
    .trim()
    .split(/\r?\n/)[0]
    .trim();
  if (n.length < 3) return;
  // Çok "etiket" gibi şeyleri ele
  if (/^(tarih|vergi|kdv|toplam|fatura|irsaliye|datum|rechnung|summe)$/i.test(n)) return;
  return n;
}

function extractCustomer(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Etiketli satırlar
  const labelPatterns = [
    /(müşteri|alıcı|unvan|cari|sayın)\s*[:\-]\s*(.+)/i,
    /(müşteri|alıcı|unvan|cari|sayın)\s+(.+)/i,
    /(kunde|kundin|firma|firmenname|rechnungsempfänger)\s*[:\-]\s*(.+)/i,
    /(kunde|kundin|firma|firmenname|rechnungsempfänger)\s+(.+)/i,
  ];
  for (const ln of lines) {
    for (const p of labelPatterns) {
      const m = ln.match(p);
      if (m?.[2]) {
        const c = cleanCustomerName(m[2]);
        if (c) return c;
      }
    }
  }

  // Fallback: İlk 15 satır içinde “firma adı gibi” görünen en uzun satırı seç
  const candidates = lines.slice(0, 15).filter((ln) => {
    if (ln.length < 5) return false;
    if (/\d/.test(ln)) return false;
    if (/(verg[iı]|kdv|toplam|tarih|fatura|no|tel|adres|e-?posta)/i.test(ln)) return false;
    return true;
  });
  candidates.sort((a, b) => b.length - a.length);
  return cleanCustomerName(candidates[0] ?? "");
}

function bestLabeledAmount(text: string, labelRegex: RegExp): number | undefined {
  const lines = text.split(/\r?\n/);
  for (const ln of lines) {
    if (!labelRegex.test(ln)) continue;
    // aynı satırda sayı arayalım
    const m = ln.match(/(-?\d[\d\s.]*[.,]\d{2})/);
    if (m) return parseMoney(m[1]);
  }
  return;
}

function guessLargestAmount(text: string): number | undefined {
  // fallback: en büyük para değeri genelde toplamdır
  const matches = Array.from(text.matchAll(/(-?\d[\d\s.]*[.,]\d{2})/g)).map((m) => parseMoney(m[1]));
  const nums = matches.filter((n): n is number => typeof n === "number" && n >= 0);
  if (nums.length === 0) return;
  nums.sort((a, b) => b - a);
  return nums[0];
}

export function extractInvoiceFields(rawText: string): OcrExtract {
  const text = normalizeText(rawText);

  const customerName = extractCustomer(text);
  const customerEmail = extractEmail(text);
  const customerPhone = extractPhone(text);
  const customerAddress = extractAddress(text);
  const issueDateISO = extractDate(text);
  const currency = extractCurrency(text);

  // Toplam
  const total =
    bestLabeledAmount(
      text,
      /(genel\s*toplam|toplam\s*tutar|ödenecek|ödenecek\s*tutar|tutarı|gesamtbetrag|gesamt\s*betrag|rechnungsbetrag|gesamt|endbetrag|summe)/i,
    ) ?? guessLargestAmount(text);

  // KDV
  const vatTotal =
    bestLabeledAmount(text, /(kdv\s*toplam|toplam\s*kdv|kdv|mwst|ust|vat)/i) ??
    (() => {
      // bazen "%20 KDV" satırında tutar olur
      const lines = text.split(/\r?\n/);
      for (const ln of lines) {
        if (!/(kdv|mwst|ust|vat)/i.test(ln)) continue;
        const m = ln.match(/(-?\d[\d\s.]*[.,]\d{2})/);
        if (m) return parseMoney(m[1]);
      }
      return;
    })();

  return {
    rawText,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    issueDateISO,
    total,
    vatTotal,
    currency,
    items: extractItems(text, currency),
  };
}

