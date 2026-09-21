import fs from "node:fs";
import path from "node:path";

const PLACEHOLDER =
  /^(?:your_typesafe_api_key|changeme|replace_me|paste_your_key|todo|xxx+)$/i;

export function loadDotEnv(cwd = process.cwd()): void {
  for (const dir of [cwd, process.cwd()]) {
    const file = path.join(dir, ".env");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}

export function isPlaceholderKey(key: string): boolean {
  const k = key.trim();
  if (!k) return true;
  if (PLACEHOLDER.test(k)) return true;
  if (/your_typesafe/i.test(k)) return true;
  if (/^YOUR_/i.test(k)) return true;
  return false;
}

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length < 8) return "(too short)";
  return `${k.slice(0, 7)}…${k.slice(-4)}`;
}

export function requireApiKey(): string {
  loadDotEnv();
  const key = process.env.TYPESAFE_API_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "TYPESAFE_API_KEY is not set. Copy .env.example to .env and paste your own TypeSafe key from https://console.typesafe.ai — do not use someone else's key.",
    );
  }
  if (isPlaceholderKey(key)) {
    throw new Error(
      "TYPESAFE_API_KEY looks like a placeholder. Replace YOUR_TYPESAFE_API_KEY in .env or .cursor/mcp.json with your own key.",
    );
  }
  return key;
}
