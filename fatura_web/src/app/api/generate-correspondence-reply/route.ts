import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function buildReplyPrompt(args: {
  replyLang: string;
  ocrSummary: string;
  issuerName: string | null;
  referenceNo: string | null;
  companyName: string | null;
  companyAddress: string | null;
  priorSavedReply: string | null;
  additionalIncoming: string | null;
}): { system: string; user: string } {
  const lang =
    args.replyLang === "de" ? "German (Sie-Form, formal)" : args.replyLang === "en" ? "English (formal)" : "Turkish (formal)";

  const system = [
    "You draft a formal reply letter on behalf of a small business to an authority or counterparty.",
    "Do not invent facts; if information is missing, use neutral placeholders like [Datum ergänzen] or […].",
    "Output plain text only (no markdown). Suitable for official correspondence.",
    `Language: ${lang}.`,
  ].join("\n");

  const user = [
    "CONTEXT:",
    args.companyName ? `Our company: ${args.companyName}` : "Our company: (not provided)",
    args.companyAddress ? `Address: ${args.companyAddress}` : "",
    "",
    "INCOMING LETTER (summary / OCR excerpt):",
    args.ocrSummary.slice(0, 12000),
    "",
    args.issuerName ? `Sender / authority: ${args.issuerName}` : "",
    args.referenceNo ? `Reference / Aktenzeichen: ${args.referenceNo}` : "",
    "",
    args.priorSavedReply
      ? `PREVIOUS DRAFT WE SAVED (revise or extend if needed):\n${args.priorSavedReply.slice(0, 8000)}`
      : "",
    args.additionalIncoming
      ? `\nNEW FOLLOW-UP INCOMING (append acknowledgement):\n${args.additionalIncoming.slice(0, 6000)}`
      : "",
    "",
    "Write the full reply letter text.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

async function openAiReply(system: string, user: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY" };

  const model = (process.env.OPENAI_MODEL ?? "gpt-4.1-mini").trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `OpenAI: ${resp.status} ${t.slice(0, 300)}` };
  }

  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Boş yanıt." };
  return { ok: true, text: text.trim() };
}

async function geminiReply(system: string, user: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY" };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.35 },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `Gemini: ${resp.status} ${t.slice(0, 300)}` };
  }

  const raw = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = raw?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) && typeof parts[0]?.text === "string" ? parts[0].text : "";
  if (!text.trim()) return { ok: false, error: "Boş yanıt." };
  return { ok: true, text: text.trim() };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    replyLang?: string;
    ocrSummary?: string;
    issuerName?: string | null;
    referenceNo?: string | null;
    companyName?: string | null;
    companyAddress?: string | null;
    priorSavedReply?: string | null;
    additionalIncoming?: string | null;
  } | null;

  const ocrSummary = (body?.ocrSummary ?? "").trim();
  if (!ocrSummary) {
    return NextResponse.json({ ok: false, error: "Özet veya metin gerekli." }, { status: 400 });
  }

  const replyLang = (body?.replyLang ?? "de").trim().toLowerCase();
  const langNorm = replyLang === "tr" || replyLang === "en" || replyLang === "de" ? replyLang : "de";

  const provider = resolveProvider();
  if (!provider) {
    return NextResponse.json({ ok: false, error: "AI anahtarı yok." }, { status: 501 });
  }

  const { system, user } = buildReplyPrompt({
    replyLang: langNorm,
    ocrSummary,
    issuerName: body?.issuerName ?? null,
    referenceNo: body?.referenceNo ?? null,
    companyName: body?.companyName ?? null,
    companyAddress: body?.companyAddress ?? null,
    priorSavedReply: body?.priorSavedReply ?? null,
    additionalIncoming: body?.additionalIncoming ?? null,
  });

  const result = provider === "openai" ? await openAiReply(system, user) : await geminiReply(system, user);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, reply: result.text });
}
