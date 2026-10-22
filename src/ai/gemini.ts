import type { Env } from "../env";

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export interface GenerateOptions {
  json?: boolean;
  system?: string;
  temperature?: number;
}

class GeminiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const RETRYABLE = new Set([429, 500, 503]);

async function callOnce(
  env: Env,
  model: string,
  body: unknown,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new GeminiError(res.status, `${model} HTTP ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new GeminiError(200, `${model}: respons kosong`);
  return text;
}

// Model utama dicoba 2 kali kalau sibuk (503/429). Model cadangan dicoba 1 kali.
// Total waktu tunggu terburuk sekitar 40 detik, jadi batas webhook di index.ts dinaikkan.
export async function generate(
  env: Env,
  parts: GeminiPart[],
  opts: GenerateOptions = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const models = [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter(
    (m, i, all) => m && all.indexOf(m) === i,
  );
  let lastError: unknown = new Error("Gemini tidak tersedia");

  for (let i = 0; i < models.length; i++) {
    const maxAttempts = i === 0 ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await callOnce(env, models[i], body);
      } catch (err) {
        lastError = err;
        console.error("[gemini]", err instanceof Error ? err.message : err);
        const retry =
          err instanceof GeminiError &&
          RETRYABLE.has(err.status) &&
          attempt < maxAttempts;
        if (!retry) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  throw lastError;
}
