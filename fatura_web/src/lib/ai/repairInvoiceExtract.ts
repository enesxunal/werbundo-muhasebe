/**
 * LLM bazen tablo başlığını müşteri adı sanır veya OCR'da kayan virgülle 100000 vs 1000 hatası yapar.
 * OCR metni + fatura mantığı ile hafif düzeltme (kesin muhasebe değil, kullanıcı yine kontrol eder).
 */

type AiItem = {
  line_no?: number;
  description?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
};

export type AiExtract = {
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    tax_no?: string | null;
    tax_office?: string | null;
  };
  invoice?: {
    issue_date?: string | null;
    currency?: "TRY" | "USD" | "EUR" | null;
    invoice_no?: string | null;
    subtotal?: number | null;
    vat_total?: number | null;
    total?: number | null;
    confidence?: number | null;
  };
  items?: AiItem[];
};

const TABLE_HEADER =
  /pos\.?\s*menge|menge\s+bezeichnung|bezeichnung\s+einzelpreis|einzelpreis\s+gesamtpreis|gesamtpreis|^\s*pos\.?\s+menge/i;

/** Almanya: USt-IdNr., Steuernummer — OCR’da satır kırılması için esnek desenler */
export function extractGermanTaxFromOcr(ocrText: string): { ustId: string | null; steuernummer: string | null } {
  const t = ocrText.replace(/\r/g, "");
  let ustId: string | null = null;
  const ustMatch =
    t.match(/\bUSt[_\s-]*Id(?:Nr)?\.?\s*[:\s]*((?:DE)\s*\d{9})\b/i) ||
    t.match(/\bUSt[_\s-]*Id(?:Nr)?\.?\s*[:\s]*(DE\d{9})\b/i) ||
    t.match(/\bHändler\s+USt\.?\s*Id\.?\s*[:\s]*((?:DE)\s*\d{9})\b/i) ||
    t.match(/\b(?:VAT\s*ID|VAT-ID)\s*[:\s]*((?:DE)\s*\d{9})\b/i);
  if (ustMatch?.[1]) {
    ustId = ustMatch[1].replace(/\s+/g, "").toUpperCase();
    if (!/^DE\d{9}$/.test(ustId)) {
      ustId = ustId.replace(/^DE/, "DE");
    }
  }

  let steuernummer: string | null = null;
  const stMatch =
    t.match(/\bSteuernummer\s*[:\s]*([0-9]{3}\s*\/\s*[0-9]{4}\s*\/\s*[0-9]{4})\b/i) ||
    t.match(/\bSt\.?\s*-?\s*Nr\.?\s*[:\s]*([0-9]{3}\s*\/\s*[0-9]{4}\s*\/\s*[0-9]{4})\b/i) ||
    t.match(/\bSt\.?\s*-?\s*Nr\.?\s*[:\s]*([0-9\/\s]{8,24})\b/i);
  if (stMatch?.[1]) {
    steuernummer = stMatch[1].replace(/\s+/g, " ").trim();
  }

  return { ustId, steuernummer };
}

/** Kesilen firma (alıcı) bloğu — çıkarıcı için bu bölümdeki unvan müşteri/tedarikçi olmamalı */
export function extractRecipientHintFromOcr(ocrText: string): string | null {
  const t = ocrText.replace(/\r/g, "");
  const block =
    t.match(/\bRechnungsadresse\s*[:\s]*\s*\n?\s*([^\n]+(?:\n[^\n]+){0,4})/i) ||
    t.match(/\bEmpfänger\s*[:\s]*\s*\n?\s*([^\n]+)/i) ||
    t.match(/\bLieferadresse\s*[:\s]*\s*\n?\s*([^\n]+(?:\n[^\n]+){0,2})/i);
  if (!block?.[1]) return null;
  const firstLine = block[1].split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  const m = firstLine.match(
    /\b([A-ZÄÖÜa-zäöüß][\wäöüÄÖÜß0-9\.\-\s&'’]*?\s(?:GmbH|gGmbH|AG|KG|UG|e\.V\.|e\.K\.))\b/,
  );
  if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  if (firstLine.length >= 3 && firstLine.length <= 120) return firstLine;
  return null;
}

/** Rechnungsadresse öncesi metin — genelde düzenleyen / satıcı üst blokta kalır */
export function ocrFocusIssuerBlock(ocrText: string): string {
  const t = ocrText.replace(/\r/g, "");
  const idx = t.search(/\bRechnungsadresse\b/i);
  if (idx === -1) return t;
  return t.slice(0, idx);
}

function isBadCustomerName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  const n = name.trim();
  if (n.length > 160) return true;
  if (TABLE_HEADER.test(n)) return true;
  if (/^pos\.?\s/mi.test(n)) return true;
  if (/einzelpreis|gesamtpreis/i.test(n) && /menge|bezeichnung/i.test(n)) return true;
  return false;
}

/** Almanca fatura üst bloğundan şirket unvanı (GmbH, AG, …) */
export function pickCustomerNameFromOcr(ocrText: string): string | null {
  const ocr = ocrFocusIssuerBlock(ocrText.replace(/\r/g, ""));
  const lines = ocr.split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || TABLE_HEADER.test(line)) continue;
    const m = line.match(
      /\b([A-ZÄÖÜa-zäöüß][\wäöüÄÖÜß0-9\.\-\s&'’]*?\s(?:GmbH|gGmbH|AG|KG|UG|e\.V\.|e\.K\.))\b/,
    );
    if (m?.[1]) {
      const name = m[1].replace(/\s+/g, " ").trim();
      if (!TABLE_HEADER.test(name) && name.length >= 3 && name.length <= 120) return name;
    }
  }

  const afterFirm = ocr.match(/Firmenname\s*[:\s]*\s*([^\n]+)/i);
  if (afterFirm?.[1]) {
    const cand = afterFirm[1].split(/\b(?:Kontakt|Tel:|E-?Mail|Web:|Rechnungs)/i)[0]?.trim();
    if (cand && cand.length >= 3 && !TABLE_HEADER.test(cand)) {
      return cand.replace(/\s+/g, " ").slice(0, 120);
    }
  }

  return null;
}

function repairItemsAgainstSubtotal(items: AiItem[], subtotal: number): AiItem[] {
  const lineTotals = items.map((i) => (typeof i.line_total === "number" ? i.line_total : 0));
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  if (sum <= subtotal * 1.06) return items;

  return items.map((it, idx) => {
    const lt = it.line_total;
    if (typeof lt !== "number" || lt <= subtotal * 1.15) return it;

    const others = lineTotals.reduce((a, b, i) => a + (i === idx ? 0 : b), 0);
    const scaled = Math.round((lt / 100) * 100) / 100;
    const newSum = others + scaled;
    if (newSum <= subtotal * 1.06 && Math.abs(newSum - subtotal) <= Math.abs(sum - subtotal) + 0.01) {
      let up = it.unit_price;
      if (typeof up === "number" && up > subtotal * 1.15) {
        up = Math.round((up / 100) * 100) / 100;
      }
      return { ...it, line_total: scaled, unit_price: up };
    }
    return it;
  });
}

export function repairInvoiceExtract(ocrText: string, data: AiExtract): AiExtract {
  const out: AiExtract = {
    ...data,
    customer: { ...data.customer },
    invoice: data.invoice ? { ...data.invoice } : undefined,
    items: data.items?.map((i) => ({ ...i })),
  };

  const tax = extractGermanTaxFromOcr(ocrText);
  const recipientHint = extractRecipientHintFromOcr(ocrText);
  const cn = out.customer ?? {};

  if (tax.ustId && (!cn.tax_no?.trim() || !/\bDE\d{9}\b/i.test(String(cn.tax_no)))) {
    out.customer = { ...cn, tax_no: tax.ustId };
  } else if (tax.ustId && cn.tax_no && !/\bDE\d{9}\b/i.test(String(cn.tax_no))) {
    out.customer = { ...cn, tax_no: `${tax.ustId}` };
  }

  if (tax.steuernummer && !(out.customer?.tax_office ?? "").trim()) {
    out.customer = { ...out.customer, tax_office: tax.steuernummer };
  }

  const currentName = out.customer?.name?.trim();
  const nameMatchesRecipient =
    currentName &&
    recipientHint &&
    currentName.replace(/\s+/g, " ").toLowerCase() === recipientHint.replace(/\s+/g, " ").toLowerCase();

  if (nameMatchesRecipient) {
    out.customer = { ...out.customer, name: null };
  }

  // Görüntüden saf AI çıktısında OCR yok: OCR heuristiğiyle isim yazma (yanlış birleşimi önler).
  if (ocrText.trim().length >= 12 && (isBadCustomerName(out.customer?.name) || nameMatchesRecipient)) {
    const fromOcr = pickCustomerNameFromOcr(ocrText);
    if (fromOcr) {
      const rec = recipientHint?.replace(/\s+/g, " ").toLowerCase() ?? "";
      const pick = fromOcr.replace(/\s+/g, " ").toLowerCase();
      if (!rec || pick !== rec) {
        out.customer = { ...out.customer, name: fromOcr };
      }
    }
  }

  const sub = out.invoice?.subtotal;
  if (typeof sub === "number" && out.items && out.items.length > 0) {
    out.items = repairItemsAgainstSubtotal(out.items, sub);
  }

  return out;
}
