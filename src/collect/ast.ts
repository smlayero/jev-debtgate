import { parse, type SgNode } from "@ast-grep/napi";
import { ensureLanguages, langForFile, languageLabel } from "./langs.js";

export type FindingKind =
  | "empty_catch"
  | "sql_concat"
  | "type_escape"
  | "skip"
  | "sleep"
  | "timeout";

export type Finding = {
  kind: FindingKind;
  text: string;
  line: number;
};

export type Structure = {
  language: string;
  functions: { name: string; approx_lines: number }[];
  class_count: number;
  imports: string[];
  timeouts: number[];
  findings: Finding[];
};

const MAX_SOURCE = 800_000;
const SQL_KW = /\b(SELECT|INSERT|UPDATE|DELETE|MERGE|UPSERT)\b/i;
const SKIP_CALLEE =
  /(^|\.)(skip|Skip|xit|xtest|xdescribe|Ignore)\b|@pytest\.mark\.skip|pytest\.mark\.skip/;
const SLEEP_CALLEE =
  /(^|\.)(sleep|Sleep|setTimeout|usleep|time\.sleep|Thread\.sleep|time\.Sleep|std::thread::sleep)\b/;
const TEST_CALLEE = /^(it|test|describe|xit|xtest|xdescribe)(\.|$)/;
const TYPE_ESCAPE_COMMENT = /@ts-ignore|@ts-expect-error|type:\s*ignore|#\s*noqa|nolint/i;
const EMPTY_KINDS = new Set([
  "catch_clause",
  "except_clause",
  "catch_block",
  "rescue",
  "rescue_clause",
]);
const FN_KINDS = new Set([
  "function_declaration",
  "function_definition",
  "function_item",
  "method_definition",
  "method_declaration",
  "generator_function_declaration",
  "arrow_function",
]);
const CLASS_KINDS = new Set([
  "class_declaration",
  "class_definition",
  "class_item",
  "class_specifier",
  "class",
  "interface_declaration",
]);
const IMPORT_KINDS = new Set([
  "import_statement",
  "import_declaration",
  "import_from_statement",
  "import_spec",
  "use_declaration",
  "using_directive",
]);
const CONCAT_KINDS = new Set([
  "binary_expression",
  "binary_operator",
  "template_string",
  "template_literal",
  "formatted_string",
  "interpolation",
  "string_interpolation",
]);

function kindOf(node: SgNode): string {
  return String(node.kind());
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function unquote(text: string): string {
  const t = text.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith("`") && t.endsWith("`"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function safeFindAll(root: SgNode, kind: string): SgNode[] {
  try {
    return root.findAll({ rule: { kind } });
  } catch {
    return [];
  }
}

function emptyStructure(language: string): Structure {
  return {
    language,
    functions: [],
    class_count: 0,
    imports: [],
    timeouts: [],
    findings: [],
  };
}

function isEmptyish(node: SgNode): boolean {
  const block = node
    .namedChildren()
    .find((c) => /block|suite|compound_statement|statement_block/.test(kindOf(c)));
  const target = block ?? node;
  const inspect = target
    .namedChildren()
    .filter(
      (c) =>
        kindOf(c) !== "comment" &&
        !/^(except_clause|catch_clause|identifier|type_identifier|generic_type|array_type|parameter|formal_parameters|condition|parenthesized_expression|binary_expression)$/.test(
          kindOf(c),
        ),
    );
  if (inspect.length === 0) {
    const compact = target
      .text()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*|#.*$/gm, "")
      .replace(/catch\s*\([^)]*\)|except[^:]*:|rescue|try/gi, "")
      .replace(/[{}\s;]/g, "");
    return compact.length === 0 || compact === "pass" || compact === "..." || compact === "None";
  }
  if (inspect.length === 1) {
    const k = kindOf(inspect[0]!);
    const t = inspect[0]!.text().trim();
    if (k === "pass_statement" || k === "ellipsis" || t === "pass" || t === "..." || t === ";") {
      return true;
    }
    if (/block|suite/.test(k)) return isEmptyish(inspect[0]!);
  }
  return false;
}

function calleeText(node: SgNode): string {
  const args = node
    .namedChildren()
    .find((c) => /arguments|argument_list|argument_list_expr/.test(kindOf(c)));
  const first = node.namedChildren()[0];
  if (first && first !== args) return first.text();
  return node.text().split("(")[0]?.trim() ?? "";
}

function callArgs(node: SgNode): SgNode[] {
  const args = node
    .namedChildren()
    .find((c) => /arguments|argument_list/.test(kindOf(c)));
  if (args) return args.namedChildren();
  return node.namedChildren().slice(1);
}

function nodeName(node: SgNode): string {
  for (const field of ["name", "identifier"]) {
    try {
      const child = (
        node as SgNode & { field(name: string): SgNode | null }
      ).field(field);
      if (child) return child.text();
    } catch {
      /* field not on this kind */
    }
  }
  const id = node
    .namedChildren()
    .find((c) => /identifier|name|property_identifier/.test(kindOf(c)));
  return id?.text() ?? "(anonymous)";
}

function addFinding(out: Finding[], kind: FindingKind, node: SgNode): void {
  out.push({
    kind,
    text: clip(node.text()),
    line: node.range().start.line + 1,
  });
}

function collectImports(root: SgNode): string[] {
  const specs: string[] = [];
  for (const kind of IMPORT_KINDS) {
    for (const node of safeFindAll(root, kind)) {
      for (const str of [
        ...node.namedChildren().filter((c) => /string|interpreted_string/.test(kindOf(c))),
        ...safeFindAll(node, "string"),
        ...safeFindAll(node, "string_fragment"),
        ...safeFindAll(node, "interpreted_string_literal"),
        ...safeFindAll(node, "dotted_name"),
      ]) {
        const v = unquote(str.text());
        if (v && !specs.includes(v)) specs.push(v);
      }
      if (kind === "import_spec" && specs.length === 0) {
        const v = unquote(node.text());
        if (v) specs.push(v);
      }
    }
  }
  for (const call of [
    ...safeFindAll(root, "call_expression"),
    ...safeFindAll(root, "call"),
  ]) {
    if (calleeText(call) !== "require") continue;
    const first = callArgs(call)[0];
    if (first) specs.push(unquote(first.text()));
  }
  return specs;
}

function collectFunctions(root: SgNode): { name: string; approx_lines: number }[] {
  const found: { name: string; approx_lines: number }[] = [];
  for (const kind of FN_KINDS) {
    for (const node of safeFindAll(root, kind)) {
      if (kind === "arrow_function") {
        const parent = node.parent();
        if (
          parent &&
          !/variable_declarator|lexical_declaration|assignment|pair|public_field/.test(
            kindOf(parent),
          )
        ) {
          continue;
        }
      }
      const start = node.range().start.line;
      const end = node.range().end.line;
      found.push({
        name: nodeName(node),
        approx_lines: Math.max(1, end - start + 1),
      });
    }
  }
  return found.sort((a, b) => b.approx_lines - a.approx_lines).slice(0, 8);
}

function collectTimeouts(root: SgNode): number[] {
  const values: number[] = [];
  const calls = [
    ...safeFindAll(root, "call_expression"),
    ...safeFindAll(root, "call"),
    ...safeFindAll(root, "method_invocation"),
  ];
  for (const call of calls) {
    const callee = calleeText(call);
    if (!TEST_CALLEE.test(callee) && !/\.(it|test|describe)$/.test(callee)) continue;
    const args = callArgs(call);
    const last = args[args.length - 1];
    if (!last) continue;
    const n = Number(last.text().trim());
    if (Number.isFinite(n) && n >= 100) values.push(n);
  }
  for (const kind of ["pair", "property_assignment", "attribute", "keyword_argument"]) {
    for (const node of safeFindAll(root, kind)) {
      const t = node.text();
      const m = t.match(/timeout\s*[:=]\s*(\d{3,})/i);
      if (m) values.push(Number(m[1]));
    }
  }
  return values;
}

function collectFindings(root: SgNode): Finding[] {
  const findings: Finding[] = [];

  for (const kind of EMPTY_KINDS) {
    for (const node of safeFindAll(root, kind)) {
      if (isEmptyish(node)) addFinding(findings, "empty_catch", node);
    }
  }
  for (const node of safeFindAll(root, "if_statement")) {
    if (/err\s*!=\s*nil/.test(node.text()) && isEmptyish(node)) {
      addFinding(findings, "empty_catch", node);
    }
  }

  for (const kind of CONCAT_KINDS) {
    for (const node of safeFindAll(root, kind)) {
      const t = node.text();
      if (!SQL_KW.test(t)) continue;
      const concat =
        t.includes("+") ||
        t.includes("${") ||
        t.includes("||") ||
        (kind.includes("template") && /\$\{|\{/.test(t)) ||
        kind === "formatted_string" ||
        kind === "interpolation";
      if (concat) addFinding(findings, "sql_concat", node);
    }
  }

  for (const node of [...safeFindAll(root, "as_expression"), ...safeFindAll(root, "type_assertion")]) {
    if (/\bany\b|\bunknown\b/.test(node.text())) addFinding(findings, "type_escape", node);
  }
  for (const node of [
    ...safeFindAll(root, "type_annotation"),
    ...safeFindAll(root, "type"),
  ]) {
    if (/^:\s*any\b/.test(node.text().trim()) || node.text().trim() === "any") {
      addFinding(findings, "type_escape", node);
    }
  }
  for (const node of safeFindAll(root, "comment")) {
    if (TYPE_ESCAPE_COMMENT.test(node.text())) addFinding(findings, "type_escape", node);
  }

  const calls = [
    ...safeFindAll(root, "call_expression"),
    ...safeFindAll(root, "call"),
    ...safeFindAll(root, "method_invocation"),
  ];
  for (const node of calls) {
    const callee = calleeText(node);
    if (SKIP_CALLEE.test(callee)) addFinding(findings, "skip", node);
    if (SLEEP_CALLEE.test(callee)) addFinding(findings, "sleep", node);
  }
  for (const node of [...safeFindAll(root, "decorator"), ...safeFindAll(root, "attribute_item")]) {
    if (/skip|ignore|disabled/i.test(node.text())) addFinding(findings, "skip", node);
  }

  return findings;
}

export function analyzeSource(filePath: string, source: string): Structure {
  ensureLanguages();
  const lang = langForFile(filePath);
  if (!lang) return emptyStructure("unknown");
  if (source.length > MAX_SOURCE) return emptyStructure(languageLabel(lang));
  let root: SgNode;
  try {
    root = parse(lang as never, source).root();
  } catch {
    return emptyStructure(languageLabel(lang));
  }
  const functions = collectFunctions(root);
  return {
    language: languageLabel(lang),
    functions,
    class_count: [...CLASS_KINDS].reduce((n, k) => n + safeFindAll(root, k).length, 0),
    imports: collectImports(root),
    timeouts: collectTimeouts(root),
    findings: collectFindings(root),
  };
}

function findingKey(f: Finding): string {
  return `${f.kind}:${f.text}`;
}

export type DiffHits = {
  timeout_bumps: string[];
  skip_added: string[];
  empty_catch: string[];
  sql_concat: string[];
  type_escape: string[];
  sleep_added: string[];
  languages: string[];
};

export function emptyDiffHits(): DiffHits {
  return {
    timeout_bumps: [],
    skip_added: [],
    empty_catch: [],
    sql_concat: [],
    type_escape: [],
    sleep_added: [],
    languages: [],
  };
}

function label(file: string, f: Finding): string {
  return `${f.kind}:${file}:${f.line} ${f.text}`;
}

export function compareSources(
  file: string,
  oldSource: string | null,
  newSource: string | null,
): DiffHits {
  const hits = emptyDiffHits();
  if (newSource == null || newSource === "") return hits;
  const newer = analyzeSource(file, newSource);
  hits.languages = [newer.language];
  const older = oldSource ? analyzeSource(file, oldSource) : emptyStructure(newer.language);
  const oldKeys = new Set(older.findings.map(findingKey));
  for (const f of newer.findings) {
    if (oldKeys.has(findingKey(f))) continue;
    const line = label(file, f);
    if (f.kind === "empty_catch") hits.empty_catch.push(line);
    else if (f.kind === "sql_concat") hits.sql_concat.push(line);
    else if (f.kind === "type_escape") hits.type_escape.push(line);
    else if (f.kind === "skip") hits.skip_added.push(line);
    else if (f.kind === "sleep") hits.sleep_added.push(line);
    else if (f.kind === "timeout") hits.timeout_bumps.push(line);
  }
  const oldMax = older.timeouts.length ? Math.max(...older.timeouts) : 0;
  const newMax = newer.timeouts.length ? Math.max(...newer.timeouts) : 0;
  if (newMax > oldMax && newMax >= 100) {
    hits.timeout_bumps.push(`timeout:${file} ${oldMax} -> ${newMax}`);
  }
  return hits;
}

export function mergeHits(into: DiffHits, extra: DiffHits): void {
  into.timeout_bumps.push(...extra.timeout_bumps);
  into.skip_added.push(...extra.skip_added);
  into.empty_catch.push(...extra.empty_catch);
  into.sql_concat.push(...extra.sql_concat);
  into.type_escape.push(...extra.type_escape);
  into.sleep_added.push(...extra.sleep_added);
  for (const lang of extra.languages) {
    if (!into.languages.includes(lang)) into.languages.push(lang);
  }
  const cap = 12;
  into.timeout_bumps = into.timeout_bumps.slice(0, cap);
  into.skip_added = into.skip_added.slice(0, cap);
  into.empty_catch = into.empty_catch.slice(0, cap);
  into.sql_concat = into.sql_concat.slice(0, cap);
  into.type_escape = into.type_escape.slice(0, cap);
  into.sleep_added = into.sleep_added.slice(0, cap);
}
