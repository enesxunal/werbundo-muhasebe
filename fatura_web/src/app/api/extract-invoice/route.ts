import { NextResponse } from "next/server";
import { repairInvoiceExtract } from "@/lib/ai/repairInvoiceExtract";

export const runtime = "nodejs";
/** Görüntülü isteklerde Vercel zaman aşımını aşmamak için (Pro’da artırılabilir) */
export const maxDuration = 60;

/** Vercel gövde limitine yaklaşmamak için (yaklaşık üst sınır) */
const MAX_IMAGE_BASE64_CHARS = 2_400_000;

type AiItem = {
  line_no?: number;
  description?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
};

type AiExtract = {
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

type VisionImage = { mimeType: string; base64: string };

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function unwrapJsonText(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

function buildPrompts(ocrText: string, hasInvoiceImage: boolean) {
  const system = [
    "You extract structured invoice data for accounting.",
    "Return ONLY valid JSON (no markdown, no code fences).",
    "If uncertain, set fields to null and lower confidence.",
    "Dates must be ISO YYYY-MM-DD when possible.",
    "Currency must be one of TRY, USD, EUR when possible.",
    "Items: include line items if present; otherwise items=[]",
    "",
    "SUPPLIER (customer in JSON) = INVOICE ISSUER / SELLER / Lieferant (Rechnungsaussteller) — NOT the buyer:",
    "- customer.name = ONLY the company that ISSUED the invoice (sends the Rechnung). Usually: letterhead / logo area, or the company next to 'USt-IdNr' in the footer, or the block that also shows the seller's Steuernummer.",
    "- The RECIPIENT / buyer (Rechnungsadresse, Kunde, Empfänger, 'Rechnung an', delivery address) is NOT customer — never put the bill-to company into customer.name even if the name is more visible on the left side.",
    "- Example layout: issuer/logo often top-right; buyer often under 'Rechnungsadresse' on the left — supplier is issuer, not buyer.",
    "- German company forms: GmbH, gGmbH, AG, KG, UG, e.V., e.K.",
    "- Tax ids: put 'USt-IdNr' (e.g. DE123456789) in customer.tax_no; put Steuernummer / St.-Nr. (digits with slashes) in customer.tax_office when separate.",
    "- NEVER use table column headers as customer.name: not 'Pos.', 'Menge', 'Bezeichnung', 'Einzelpreis', 'Gesamtpreis', …",
    "- If OCR_TEXT is empty, use ONLY the image for names and tax ids.",
    "- If unsure which side is issuer, set customer.name to null.",
    "",
    "NUMBER FORMAT (very important for DE/TR style invoices):",
    "- '.' is often thousands separator and ',' is decimal separator (example: 1.000,00 means 1000.00).",
    "- Do NOT treat 1.000,00 as 10000. When in doubt, prefer the invoice IMAGE for monetary amounts.",
    "- OCR often drops a comma/dot or merges digits; do not blindly copy OCR amounts.",
    hasInvoiceImage
      ? "An invoice IMAGE is provided: the IMAGE is the PRIMARY source for ALL fields — company name, tax ids, dates, currency, every amount, VAT, line items, and descriptions. Treat OCR_TEXT as optional hints only if it is clearly present; if OCR is empty or noise, rely 100% on the image."
      : "No image is provided: use OCR text but be skeptical of digit errors; cross-check plausibility (e.g. line totals vs invoice total).",
  ].join("\n");

  const ocrBlock = ocrText.trim().length ? ocrText.slice(0, 24000) : "(OCR metni yok veya boş — sadece görüntüden çıkar.)";

  const user = [
    "OCR_TEXT_START",
    ocrBlock,
    "OCR_TEXT_END",
    "",
    "Return JSON with this shape:",
    JSON.stringify(
      {
        customer: {
          name: "string|null",
          email: "string|null",
          phone: "string|null",
          address: "string|null",
          tax_no: "string|null",
          tax_office: "string|null",
        },
        invoice: {
          issue_date: "YYYY-MM-DD|null",
          currency: "TRY|USD|EUR|null",
          invoice_no: "string|null",
          subtotal: "number|null",
          vat_total: "number|null",
          total: "number|null",
          confidence: "number|null",
        },
        items: [
          {
            line_no: "number|null",
            description: "string",
            quantity: "number|null",
            unit: "string|null",
            unit_price: "number|null",
            line_total: "number|null",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");

  return { system, user };
}

type Provider = "openai" | "gemini";

function resolveProvider(): Provider | null {
  const forced = (process.env.INVOICE_AI_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "openai") return "openai";
  if (forced === "gemini") return "gemini";
  if (forced && forced !== "auto") return null;

  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  if (hasOpenai) return "openai";
  if (hasGemini) return "gemini";
  return null;
}

async function extractWithOpenAI(
  ocrText: string,
  image: VisionImage | null,
): Promise<{ ok: true; data: AiExtract } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY ayarlı değil." };

  const hasInvoiceImage = Boolean(image?.base64);
  const { system, user } = buildPrompts(ocrText, hasInvoiceImage);

  const textModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const visionModel = (process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini").trim();
  const model = hasInvoiceImage ? visionModel : textModel;

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

  const userContent: ContentPart[] = [];
  if (hasInvoiceImage && image) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" },
    });
  }
  userContent.push({ type: "text", text: user });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `OpenAI hata: ${resp.status} ${t}` };
  }

  const data = (await resp.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { ok: false, error: "OpenAI cevabı beklenmedik." };
  }

  const parsed = safeJsonParse(unwrapJsonText(content)) as AiExtract | null;
  if (!parsed) return { ok: false, error: "JSON parse edilemedi." };
  return { ok: true, data: parsed };
}

async function extractWithGemini(
  ocrText: string,
  image: VisionImage | null,
): Promise<{ ok: true; data: AiExtract } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY ayarlı değil." };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const hasInvoiceImage = Boolean(image?.base64);
  const { system, user } = buildPrompts(ocrText, hasInvoiceImage);

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  if (hasInvoiceImage && image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.base64,
      },
    });
  }
  parts.push({ text: user });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `Gemini hata: ${resp.status} ${t}` };
  }

  const data = (await resp.json()) as any;
  const respParts = data?.candidates?.[0]?.content?.parts;
  const text =
    Array.isArray(respParts) && typeof respParts[0]?.text === "string"
      ? respParts[0].text
      : typeof data?.candidates?.[0]?.content?.text === "string"
        ? data.candidates[0].content.text
        : null;

  if (typeof text !== "string") {
    return { ok: false, error: "Gemini cevabı beklenmedik (muhtemelen güvenlik filtresi veya boş aday)." };
  }

  const parsed = safeJsonParse(unwrapJsonText(text)) as AiExtract | null;
  if (!parsed) return { ok: false, error: "JSON parse edilemedi." };
  return { ok: true, data: parsed };
}

function normalizeVisionInput(body: {
  ocrText?: string;
  imageBase64?: string;
  mimeType?: string;
}): { ok: true; ocrText: string; image: VisionImage | null } | { ok: false; error: string } {
  const ocrText = (body.ocrText ?? "").trim();
  const rawB64 = (body.imageBase64 ?? "").replace(/\s/g, "");
  const mimeType = (body.mimeType ?? "image/jpeg").trim().toLowerCase();

  if (!ocrText && !rawB64) {
    return { ok: false, error: "ocrText ve görüntü ikisi de boş." };
  }

  if (!rawB64) {
    return { ok: true, ocrText: ocrText || "", image: null };
  }

  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
    return { ok: false, error: "mimeType desteklenmiyor. image/jpeg, image/png veya image/webp kullanın." };
  }

  if (rawB64.length > MAX_IMAGE_BASE64_CHARS) {
    return { ok: false, error: "Görüntü çok büyük; istemci tarafında daha küçük JPEG gönderin." };
  }

  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  return { ok: true, ocrText, image: { mimeType: normalizedMime, base64: rawB64 } };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    ocrText?: string;
    imageBase64?: string;
    mimeType?: string;
  } | null;

  const normalized = normalizeVisionInput(body ?? {});
  if (!normalized.ok) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  const { ocrText, image } = normalized;

  const provider = resolveProvider();
  if (!provider) {
    const forced = (process.env.INVOICE_AI_PROVIDER ?? "").trim().toLowerCase();
    if (forced && forced !== "openai" && forced !== "gemini" && forced !== "auto") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "INVOICE_AI_PROVIDER geçersiz. openai, gemini veya auto kullanın (boş bırakınca auto: önce OpenAI anahtarı, yoksa Gemini).",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI anahtarı yok. Vercel ortam değişkenlerinden birini ekleyin: OPENAI_API_KEY veya GEMINI_API_KEY (tarayıcıya koymayın). İsterseniz INVOICE_AI_PROVIDER=openai|gemini ile seçin.",
      },
      { status: 501 },
    );
  }

  const result =
    provider === "openai" ? await extractWithOpenAI(ocrText, image) : await extractWithGemini(ocrText, image);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  const repaired = repairInvoiceExtract(ocrText, result.data);
  return NextResponse.json({ ok: true, data: repaired });
}
