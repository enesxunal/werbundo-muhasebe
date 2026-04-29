import { NextResponse } from "next/server";
import type { AiCorrespondenceExtract } from "@/lib/correspondence/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BASE64_CHARS = 2_400_000;

type VisionImage = { mimeType: string; base64: string };

type ParentHint = { id: string; reference_no: string | null; summary: string | null };

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

function buildPrompts(ocrText: string, hasImage: boolean, parents: ParentHint[]) {
  const parentsJson = JSON.stringify(
    parents.map((p) => ({
      id: p.id,
      reference_no: p.reference_no,
      summary: p.summary ? String(p.summary).slice(0, 400) : null,
    })),
  );

  const system = [
    "You classify German/Turkish official letters for small businesses: tax office, municipality (Ordnungsamt), police, Finanzamt, etc.",
    "Return ONLY valid JSON (no markdown fences).",
    "category must be one of: official_letter, fine, payment_notice, compliance, other.",
    "official_letter: general Bescheid, Schreiben, Mahnung ohne Strafe.",
    "fine: Bußgeldbescheid, Strafbefehl, OWi.",
    "payment_notice: Zahlungsaufforderung, Steuerzahlung, Gebühr.",
    "compliance: signage/size/order to remedy by a deadline (Tabelle, Werbung, Ordnungswidrigkeit mit Frist).",
    "issuer_name: authority or company that sent the letter (Absender/Behörde).",
    "Extract deadlines: look for 'bis zum', 'innerhalb von ... Tagen', 'Frist', 'zu begleichen bis'.",
    "Dates must be ISO YYYY-MM-DD when possible; else null.",
    "If PARENT_LETTERS may match (same Aktenzeichen/reference or same authority + topic), set suggested_parent_id to that id else null.",
    "append_note_for_parent: if this clearly continues a previous letter, a short note (1-3 sentences) to append under the thread; else null.",
    hasImage
      ? "An IMAGE is provided — prefer the IMAGE for dates, reference numbers, and authority names."
      : "Use OCR text; if unclear set fields null.",
  ].join("\n");

  const user = [
    "PARENT_LETTERS_JSON:",
    parentsJson,
    "",
    "OCR_TEXT_START",
    ocrText.slice(0, 24000) || "(empty)",
    "OCR_TEXT_END",
    "",
    "Return JSON:",
    JSON.stringify(
      {
        category: "official_letter|fine|payment_notice|compliance|other",
        issuer_name: "string|null",
        summary: "string|null",
        deadline_date: "YYYY-MM-DD|null",
        response_deadline_date: "YYYY-MM-DD|null",
        amount: "number|null",
        reference_no: "string|null",
        suggested_parent_id: "uuid|null",
        append_note_for_parent: "string|null",
      },
      null,
      2,
    ),
  ].join("\n");

  return { system, user };
}

async function extractWithOpenAI(
  ocrText: string,
  image: VisionImage | null,
  parents: ParentHint[],
): Promise<{ ok: true; data: AiCorrespondenceExtract } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY ayarlı değil." };

  const hasImage = Boolean(image?.base64);
  const { system, user } = buildPrompts(ocrText, hasImage, parents);
  const textModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const visionModel = (process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini").trim();
  const model = hasImage ? visionModel : textModel;

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

  const userContent: ContentPart[] = [];
  if (hasImage && image) {
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

  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return { ok: false, error: "OpenAI cevabı beklenmedik." };

  const parsed = safeJsonParse(unwrapJsonText(content)) as AiCorrespondenceExtract | null;
  if (!parsed) return { ok: false, error: "JSON parse edilemedi." };
  return { ok: true, data: parsed };
}

async function extractWithGemini(
  ocrText: string,
  image: VisionImage | null,
  parents: ParentHint[],
): Promise<{ ok: true; data: AiCorrespondenceExtract } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY ayarlı değil." };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const hasImage = Boolean(image?.base64);
  const { system, user } = buildPrompts(ocrText, hasImage, parents);

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  if (hasImage && image) {
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

  const raw = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[]; text?: string } }[];
  };
  const respParts = raw?.candidates?.[0]?.content?.parts;
  const text =
    Array.isArray(respParts) && typeof respParts[0]?.text === "string"
      ? respParts[0].text
      : typeof raw?.candidates?.[0]?.content?.text === "string"
        ? raw.candidates[0].content.text
        : null;

  if (typeof text !== "string") {
    return { ok: false, error: "Gemini cevabı beklenmedik." };
  }

  const parsed = safeJsonParse(unwrapJsonText(text)) as AiCorrespondenceExtract | null;
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
    return { ok: false, error: "mimeType desteklenmiyor." };
  }

  if (rawB64.length > MAX_IMAGE_BASE64_CHARS) {
    return { ok: false, error: "Görüntü çok büyük." };
  }

  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  return { ok: true, ocrText, image: { mimeType: normalizedMime, base64: rawB64 } };
}

function normalizeCategory(
  c: string | undefined,
): "official_letter" | "fine" | "payment_notice" | "compliance" | "other" {
  const v = (c ?? "").trim().toLowerCase();
  if (
    v === "official_letter" ||
    v === "fine" ||
    v === "payment_notice" ||
    v === "compliance" ||
    v === "other"
  ) {
    return v;
  }
  return "other";
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    ocrText?: string;
    imageBase64?: string;
    mimeType?: string;
    parentHints?: ParentHint[];
  } | null;

  const normalized = normalizeVisionInput(body ?? {});
  if (!normalized.ok) {
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  const parents = Array.isArray(body?.parentHints) ? body!.parentHints! : [];

  const provider = resolveProvider();
  if (!provider) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI anahtarı yok. OPENAI_API_KEY veya GEMINI_API_KEY ekleyin (fatura okuma ile aynı).",
      },
      { status: 501 },
    );
  }

  const result =
    provider === "openai"
      ? await extractWithOpenAI(normalized.ocrText, normalized.image, parents)
      : await extractWithGemini(normalized.ocrText, normalized.image, parents);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  const d = result.data;
  const out: AiCorrespondenceExtract = {
    category: normalizeCategory(d.category),
    issuer_name: d.issuer_name ?? null,
    summary: d.summary ?? null,
    deadline_date: d.deadline_date ?? null,
    response_deadline_date: d.response_deadline_date ?? null,
    amount: typeof d.amount === "number" && Number.isFinite(d.amount) ? d.amount : null,
    reference_no: d.reference_no ?? null,
    suggested_parent_id: d.suggested_parent_id ?? null,
    append_note_for_parent: d.append_note_for_parent ?? null,
  };

  return NextResponse.json({ ok: true, data: out });
}
