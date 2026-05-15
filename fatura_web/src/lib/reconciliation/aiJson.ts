type Provider = "openai" | "gemini";

export function resolveReconciliationProvider(): Provider | null {
  const forced = (process.env.INVOICE_AI_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "openai") return "openai";
  if (forced === "gemini") return "gemini";
  if (forced && forced !== "auto") return null;
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  return null;
}

/** Mutabakat için: Gemini yoğunsa OpenAI'ya düş */
export function resolveReconciliationProviderWithFallback(primary: Provider): Provider[] {
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  if (primary === "gemini" && hasOpenai) return ["gemini", "openai"];
  if (primary === "openai" && hasGemini) return ["openai", "gemini"];
  return [primary];
}

function unwrapJsonText(raw: string): string {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(t);
  if (fence?.[1]) return fence[1].trim();
  return t;
}

type VisionPage = { mimeType: string; base64: string };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function runAiJson<T>(args: {
  system: string;
  userText: string;
  images?: VisionPage[];
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const primary = resolveReconciliationProvider();
  if (!primary) return { ok: false, error: "NO_PROVIDER" };

  const providers = resolveReconciliationProviderWithFallback(primary);
  let lastError = "UNKNOWN";

  for (const provider of providers) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const result =
        provider === "openai" ? await runOpenAiJson<T>(args) : await runGeminiJson<T>(args);

      if (result.ok) return result;

      lastError = result.error;
      const statusMatch = /(OpenAI|Gemini)\s+(\d+)/.exec(result.error);
      const status = statusMatch ? Number(statusMatch[2]) : 0;

      if (!isRetryableStatus(status) && attempt > 0) break;
      if (attempt < 3) {
        await sleep(800 * (attempt + 1) + (provider === "gemini" ? 400 : 0));
      }
    }
  }

  return { ok: false, error: lastError };
}

async function runOpenAiJson<T>(args: {
  system: string;
  userText: string;
  images?: VisionPage[];
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY" };

  const model = (process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini").trim();
  type Part =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

  const userContent: Part[] = [];
  for (const img of args.images ?? []) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "low" },
    });
  }
  userContent.push({ type: "text", text: args.userText });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    return { ok: false, error: `OpenAI ${resp.status}` };
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return { ok: false, error: "OpenAI empty" };
  try {
    return { ok: true, data: JSON.parse(unwrapJsonText(content)) as T };
  } catch {
    return { ok: false, error: "JSON parse" };
  }
}

async function runGeminiJson<T>(args: {
  system: string;
  userText: string;
  images?: VisionPage[];
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY" };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.0-flash").trim();
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  for (const img of args.images ?? []) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  parts.push({ text: args.userText });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });

  if (!resp.ok) return { ok: false, error: `Gemini ${resp.status}` };
  const data = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return { ok: false, error: "Gemini empty" };
  try {
    return { ok: true, data: JSON.parse(unwrapJsonText(text)) as T };
  } catch {
    return { ok: false, error: "JSON parse" };
  }
}
