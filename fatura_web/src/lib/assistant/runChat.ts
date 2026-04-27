export type ChatMessage = { role: "user" | "assistant"; content: string };

type Provider = "openai" | "gemini";

export function resolveAssistantProvider(): Provider | null {
  const forced = (process.env.ASSISTANT_AI_PROVIDER ?? process.env.INVOICE_AI_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "openai") return "openai";
  if (forced === "gemini") return "gemini";
  if (forced && forced !== "auto") return null;

  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  if (hasOpenai) return "openai";
  if (hasGemini) return "gemini";
  return null;
}

function baseInstructions(locale: "tr" | "de"): string {
  if (locale === "de") {
    return [
      "Du bist ein hilfreicher Assistent für Eingangsrechnungen und Ausgaben.",
      "Du antwortest auf Deutsch, kurz und klar, außer der Nutzer möchte Details.",
      "Nutze AUSSCHLIESSLICH die im Kontext gelieferten Zahlen und Fakten.",
      "Keine Steuer- oder Rechtsberatung; verweise bei rechtlichen Fragen auf einen Steuerberater.",
      "Wenn der Kontext nicht reicht, frage nach oder sag, dass die Daten fehlen.",
    ].join("\n");
  }
  return [
    "Sen gelen faturalar ve harcama özeti için yardımcı bir asistansın.",
    "Yanıtları Türkçe, kısa ve net ver; kullanıcı detay isterse uzat.",
    "SADECE bağlamda verilen rakam ve bilgileri kullan.",
    "Vergi hukuku / muhasebe tavsiyesi verme; gerekirse uzman yönlendirmesi öner.",
    "Veri yetersizse bunu söyle, uydurma.",
  ].join("\n");
}

export async function runAssistantChat(args: {
  locale: "tr" | "de";
  contextBlock: string;
  messages: ChatMessage[];
}): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const provider = resolveAssistantProvider();
  if (!provider) {
    return { ok: false, error: "NO_PROVIDER" };
  }

  const systemContent = `${baseInstructions(args.locale)}\n\n--- DATEN / VERİ ---\n${args.contextBlock}`;

  if (provider === "openai") {
    return runOpenAI(systemContent, args.messages);
  }
  return runGemini(systemContent, args.messages);
}

async function runOpenAI(
  systemContent: string,
  messages: ChatMessage[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY" };

  const model = (process.env.ASSISTANT_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();

  const openaiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: openaiMessages,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `LLM_OPENAI_HTTP:${resp.status}:${t.slice(0, 400)}` };
  }

  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: "LLM_OPENAI_EMPTY" };
  }
  return { ok: true, reply: content.trim() };
}

async function runGemini(
  systemContent: string,
  messages: ChatMessage[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY" };

  const model = (
    process.env.ASSISTANT_GEMINI_MODEL ??
    process.env.GEMINI_MODEL ??
    "gemini-2.5-flash"
  ).trim();

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemContent }] },
      contents,
      generationConfig: {
        temperature: 0.3,
      },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return { ok: false, error: `LLM_GEMINI_HTTP:${resp.status}:${t.slice(0, 400)}` };
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const text = extractGeminiText(data);
  if (text.trim()) {
    return { ok: true, reply: text.trim() };
  }

  const block = (data as { promptFeedback?: { blockReason?: string } })?.promptFeedback?.blockReason;
  const finish = (data as { candidates?: { finishReason?: string }[] })?.candidates?.[0]?.finishReason;
  return {
    ok: false,
    error: `LLM_GEMINI_EMPTY:${finish ?? "?"}:${block ?? "?"}`,
  };
}

/** Gemini yanıtında metin birden fazla part veya farklı yerde gelebilir. */
function extractGeminiText(data: Record<string, unknown>): string {
  const cand = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
  if (!cand || typeof cand !== "object") return "";

  const content = (cand as { content?: unknown }).content;
  if (!content || typeof content !== "object") return "";

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) {
    const direct = (content as { text?: string }).text;
    return typeof direct === "string" ? direct : "";
  }

  const chunks: string[] = [];
  for (const p of parts) {
    if (p && typeof p === "object" && typeof (p as { text?: string }).text === "string") {
      chunks.push((p as { text: string }).text);
    }
  }
  return chunks.join("");
}
