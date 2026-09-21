import type { JevResponse, Question } from "./types.js";
import { requireApiKey } from "./env.js";

export { requireApiKey } from "./env.js";

const DEFAULT_URL = "https://api.typesafe.ai/v1/systemone";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function systemOne(input: {
  state: unknown;
  questions: Record<string, Question>;
  model?: string;
  apiKey?: string;
}): Promise<JevResponse> {
  const apiKey = input.apiKey ?? requireApiKey();
  const model = input.model ?? process.env.JEV_MODEL ?? "jev-latest";
  const url = process.env.TYPESAFE_URL ?? DEFAULT_URL;
  const payload = JSON.stringify({
    model,
    state: input.state,
    questions: input.questions,
  });

  let lastErr = "Jev request failed";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
    });
    const body = await res.text();
    if (res.status === 429 || res.status === 529) {
      lastErr = `Jev HTTP ${res.status}: ${body.slice(0, 200)}`;
      await sleep(400 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Jev HTTP ${res.status}: ${body.slice(0, 800)}`);
    }
    const data = JSON.parse(body) as JevResponse;
    if (!data.answers) {
      throw new Error("Jev response missing answers");
    }
    return data;
  }
  throw new Error(lastErr);
}
