import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsconfig = path.join(root, "tsconfig.json");
const src = path.join(root, "src");
if (!existsSync(tsconfig) || !existsSync(src)) process.exit(0);

const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc)) {
  console.warn("jev-debtgate: typescript not installed; skip prepare build");
  process.exit(0);
}

const result = spawnSync(process.execPath, [tsc], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
