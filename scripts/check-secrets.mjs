import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_KEY = /apikey_[0-9a-f]{16,}/i;
const SKIP = new Set(["node_modules", "dist", ".git", "coverage"]);

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
}

const files = [];
walk(root, files);
const hits = [];
for (const file of files) {
  const rel = path.relative(root, file);
  if (/\.(png|jpg|woff|map|lock)$/i.test(rel)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (REAL_KEY.test(text)) hits.push(rel);
}

if (hits.length) {
  console.error("Refusing to ship TypeSafe-looking API keys in:");
  for (const h of hits) console.error(`  ${h}`);
  console.error("Users must bring their own TYPESAFE_API_KEY.");
  process.exit(1);
}
console.log("secret-scan: no committed TypeSafe keys");
