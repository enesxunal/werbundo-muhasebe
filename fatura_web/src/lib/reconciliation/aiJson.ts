/** Banka mutabakatı — yalnızca Google Gemini */

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
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY" };

  const model = (process.env.GEMINI_MODEL ?? "gemini-2.5-flash").trim();
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
  for (const img of args.images ?? []) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  parts.push({ text: args.userText });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let lastError = "Gemini unknown";

  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    if (!resp.ok) {
      lastError = `Gemini ${resp.status}`;
      if (isRetryableStatus(resp.status) && attempt < 4) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      return { ok: false, error: lastError };
    }

    const data = (await resp.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      lastError = "Gemini empty";
      if (attempt < 4) {
        await sleep(1000);
        continue;
      }
      return { ok: false, error: lastError };
    }

    try {
      return { ok: true, data: JSON.parse(unwrapJsonText(text)) as T };
    } catch {
      return { ok: false, error: "JSON parse" };
    }
  }

  return { ok: false, error: lastError };
}
