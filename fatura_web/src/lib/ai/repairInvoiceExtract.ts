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
  const ocr = ocrText.replace(/\r/g, "");
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

  const currentName = out.customer?.name;
  // Görüntüden saf AI çıktısında OCR yok: OCR heuristiğiyle isim yazma (yanlış birleşimi önler).
  if (ocrText.trim().length >= 12 && isBadCustomerName(currentName)) {
    const fromOcr = pickCustomerNameFromOcr(ocrText);
    if (fromOcr) {
      out.customer = { ...out.customer, name: fromOcr };
    }
  }

  const sub = out.invoice?.subtotal;
  if (typeof sub === "number" && out.items && out.items.length > 0) {
    out.items = repairItemsAgainstSubtotal(out.items, sub);
  }

  return out;
}
