import { createRequire } from "node:module";
import { Lang, registerDynamicLanguage } from "@ast-grep/napi";

export type ParseLang = string;

const require = createRequire(import.meta.url);

const DYNAMIC: Record<string, string> = {
  python: "@ast-grep/lang-python",
  go: "@ast-grep/lang-go",
  rust: "@ast-grep/lang-rust",
  java: "@ast-grep/lang-java",
  kotlin: "@ast-grep/lang-kotlin",
  csharp: "@ast-grep/lang-csharp",
  ruby: "@ast-grep/lang-ruby",
  php: "@ast-grep/lang-php",
  swift: "@ast-grep/lang-swift",
  scala: "@ast-grep/lang-scala",
  c: "@ast-grep/lang-c",
  cpp: "@ast-grep/lang-cpp",
};

let ready = false;
const available = new Set<string>([
  Lang.TypeScript,
  Lang.JavaScript,
  Lang.Tsx,
  Lang.Html,
  Lang.Css,
]);

export function ensureLanguages(): Set<string> {
  if (ready) return available;
  ready = true;
  const regs: Record<string, unknown> = {};
  for (const [name, pkg] of Object.entries(DYNAMIC)) {
    try {
      regs[name] = require(pkg);
      available.add(name);
    } catch {
      // Prebuild missing on this platform; JS/TS still work.
    }
  }
  if (Object.keys(regs).length > 0) {
    registerDynamicLanguage(regs as Parameters<typeof registerDynamicLanguage>[0]);
  }
  return available;
}

const EXT: Record<string, ParseLang> = {
  ts: Lang.TypeScript,
  mts: Lang.TypeScript,
  cts: Lang.TypeScript,
  tsx: Lang.Tsx,
  jsx: Lang.Tsx,
  js: Lang.JavaScript,
  mjs: Lang.JavaScript,
  cjs: Lang.JavaScript,
  vue: Lang.Tsx,
  svelte: Lang.Tsx,
  py: "python",
  pyi: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  scala: "scala",
  sc: "scala",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
};

export function langForFile(filePath: string): ParseLang | undefined {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1).toLowerCase() : "";
  return EXT[ext];
}

export function isCodeFile(name: string): boolean {
  return langForFile(name) != null;
}

export function languageLabel(lang: ParseLang): string {
  return String(lang);
}
