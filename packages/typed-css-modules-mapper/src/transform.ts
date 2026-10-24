import postcss, { CssSyntaxError } from "postcss";
import type { AtRule, ChildNode, Declaration, Root, Rule } from "postcss";
import safeParse from "postcss-safe-parser";
import selectorParser from "postcss-selector-parser";

import { SpanMapFeature, SpanMapKind } from "./protocol.ts";
import type { MapperDiagnostic, SpanMapping, TransformResult } from "./protocol.ts";

export type LocalsConvention = "camelCase" | "camelCaseOnly" | "dashes" | "dashesOnly";

export const localsConventions: readonly LocalsConvention[] = [
  "camelCase",
  "camelCaseOnly",
  "dashes",
  "dashesOnly",
];

export interface TransformOptions {
  /** How class names are converted to export names, as in Vite's `css.modules.localsConvention`. */
  localsConvention?: LocalsConvention | null;
  /** Export every name that is a valid identifier as a named export. Defaults to `true`. */
  namedExports?: boolean;
  /** Export an object with every name as the default export. Defaults to `true`. */
  defaultExport?: boolean;
}

export const DiagnosticCode = {
  SyntaxError: 1,
  UnknownComposes: 2,
} as const;

/** An exported name: a class, id, keyframes name, `@value`, or `:export` key. */
interface Local {
  name: string;
  /** Offset and length of the name as written in the CSS, escapes included. */
  start: number;
  length: number;
  docs: string;
}

const mappingFeatures =
  SpanMapFeature.Hover |
  SpanMapFeature.Definition |
  SpanMapFeature.References |
  SpanMapFeature.DocumentHighlights;

/** Turns a CSS module into the TypeScript module TypeScript type-checks in its place. */
export function transform(content: string, options: TransformOptions = {}): TransformResult {
  // PostCSS drops a byte order mark, so its offsets start one character later.
  const bom = content.charCodeAt(0) === 0xfeff ? 1 : 0;
  const css = bom ? content.slice(1) : content;
  const diagnostics: MapperDiagnostic[] = [];
  const root = parse(css, diagnostics);
  const locals = collectLocals(root, diagnostics);
  const { text, mappings } = render(locals, options);
  if (bom) {
    for (const mapping of mappings) mapping[2] += bom;
    for (const diagnostic of diagnostics) diagnostic.start += bom;
  }
  const result: TransformResult = { text, extension: ".ts", mappings };
  if (diagnostics.length) result.diagnostics = diagnostics;
  return result;
}

function parse(content: string, diagnostics: MapperDiagnostic[]): Root {
  try {
    return postcss.parse(content);
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) throw error;
    const start = offsetAt(content, error.line, error.column);
    const end =
      error.endLine != null ? offsetAt(content, error.endLine, error.endColumn) : start + 1;
    diagnostics.push({
      messageText: error.reason,
      start,
      length: Math.max(1, Math.min(end, content.length) - start),
      code: DiagnosticCode.SyntaxError,
    });
    // Recover what we can, so that one typo doesn't fail every import of the file.
    return safeParse(content) as Root;
  }
}

function offsetAt(content: string, line = 1, column = 1): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = content.indexOf("\n", offset);
    if (next === -1) return content.length;
    offset = next + 1;
  }
  return Math.min(offset + column - 1, content.length);
}

const keyframesName = /^(?:-[a-z]+-)?keyframes$/i;

/** Offset of an at-rule's parameters, which come after `@`, its name, and the whitespace after that. */
function paramsOffset(node: AtRule, start: number): number {
  return start + 1 + node.name.length + (node.raws.afterName?.length ?? 0);
}

function collectLocals(root: Root, diagnostics: MapperDiagnostic[]): Local[] {
  const locals = new Map<string, Local>();
  const composes: Declaration[] = [];

  const add = (name: string, start: number, length: number, node: Rule | AtRule) => {
    if (!locals.has(name)) locals.set(name, { name, start, length, docs: describe(node) });
  };

  const addSelectors = (selector: string, start: number, node: Rule | AtRule) => {
    for (const found of localSelectors(selector)) {
      // `sourceIndex` points at the `.` or `#` in front of the name.
      const text = found.raws?.value ?? found.value;
      add(found.value, start + found.sourceIndex + 1, text.length, node);
    }
  };

  root.walk((node) => {
    if (node.type === "rule") {
      if (node.parent?.type === "atrule" && keyframesName.test((node.parent as AtRule).name)) {
        return;
      }
      const start = node.source?.start?.offset;
      if (start == null) return;
      if (node.selector === ":export") {
        // ICSS exports: every declaration in `:export { key: value }` is exported as is.
        node.each((child) => {
          const offset = child.source?.start?.offset;
          if (child.type === "decl" && offset != null)
            add(child.prop, offset, child.prop.length, node);
        });
        return;
      }
      addSelectors(node.raws.selector?.raw ?? node.selector, start, node);
    } else if (node.type === "atrule") {
      const start = node.source?.start?.offset;
      if (start == null) return;
      const raw = node.raws.params?.raw ?? node.params;
      const paramsStart = paramsOffset(node, start);
      const name = node.name.toLowerCase();
      if (keyframesName.test(name)) {
        const match = /^(\s*)(?::local\(\s*)?(-?[_a-zA-Z][\w-]*)/.exec(raw);
        if (!match || /^\s*:global/.test(raw)) return;
        const nameStart = match[0].length - match[2].length;
        add(match[2], paramsStart + nameStart, match[2].length, node);
      } else if (name === "value") {
        for (const [value, index] of valueNames(raw))
          add(value, paramsStart + index, value.length, node);
      } else if (name === "scope") {
        // `@scope (.card) to (.content)` scopes the selectors in both parentheses.
        for (const [selector, index] of parenthesized(raw))
          addSelectors(selector, paramsStart + index, node);
      }
    } else if (node.type === "decl" && node.prop.toLowerCase() === "composes") {
      composes.push(node);
    }
  });

  for (const decl of composes) checkComposes(decl, locals, diagnostics);

  return [...locals.values()];
}

/**
 * Returns the names an `@value` rule exports with their offsets, following postcss-modules-values:
 * `@value name: value` defines one, and `@value a, b as c from "./file.css"` imports `a` and `c`.
 */
function valueNames(params: string): [string, number][] {
  const imports = /^(.+?|\([\s\S]+?\))\s+from\s+("[^"]*"|'[^']*'|[\w-]+)$/.exec(params);
  if (imports) {
    const names: [string, number][] = [];
    for (const alias of imports[1].matchAll(/([\w-]+)(?:\s+as\s+([\w-]+))?/g)) {
      const local = alias[2] ?? alias[1];
      names.push([local, alias.index + alias[0].length - local.length]);
    }
    return names;
  }
  const definition = /(?:\s+|^)([\w-]+):?(.*?)$/s.exec(params);
  // A definition without a value, like `@value empty;`, is dropped.
  if (!definition || !definition[2].replace(/\/\*[\s\S]*?\*\//g, "").trim()) return [];
  return [[definition[1], definition.index + definition[0].indexOf(definition[1])]];
}

/** Returns the contents of each top-level pair of parentheses, with the offset of its contents. */
function parenthesized(text: string): [string, number][] {
  const groups: [string, number][] = [];
  let depth = 0;
  let open = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "(" && depth++ === 0) open = index + 1;
    else if (text[index] === ")" && depth > 0 && --depth === 0) {
      groups.push([text.slice(open, index), open]);
    }
  }
  return groups;
}

// A structural view of postcss-selector-parser's nodes: its own container types are too
// recursive for the type checker to instantiate.
interface SelectorNode {
  type: string;
  value: string;
  sourceIndex: number;
  raws?: { value?: string };
  nodes?: SelectorNode[];
}

/** Returns the classes and ids of a selector that CSS Modules scopes locally. */
function localSelectors(selector: string): SelectorNode[] {
  let ast: SelectorNode;
  try {
    ast = selectorParser().astSync(selector) as unknown as SelectorNode;
  } catch {
    return [];
  }
  const found: SelectorNode[] = [];
  const visit = (container: SelectorNode, local: boolean) => {
    for (const child of container.nodes ?? []) {
      // `:global` and `:local` without arguments switch the mode for the rest of the selector.
      let mode = local;
      for (const node of child.nodes ?? []) {
        if (node.type === "pseudo") {
          // Case-sensitive, like postcss-modules: `:GLOBAL` is an unknown pseudo-class to it.
          if (node.value === ":global" || node.value === ":local") {
            if (node.nodes?.length) visit(node, node.value === ":local");
            else mode = node.value === ":local";
          } else if (node.nodes?.length) {
            visit(node, mode);
          }
        } else if (mode && (node.type === "class" || node.type === "id")) {
          found.push(node);
        }
      }
    }
  };
  visit(ast, true);
  return found;
}

function checkComposes(
  decl: Declaration,
  locals: Map<string, Local>,
  diagnostics: MapperDiagnostic[],
) {
  const start = decl.source?.start?.offset;
  if (start == null) return;
  const raw = decl.raws.value?.raw ?? decl.value;
  // Names composed from other files or from global scope are checked elsewhere, or not at all.
  if (/\sfrom\s/i.test(raw)) return;
  const valueStart = start + decl.prop.length + (decl.raws.between?.length ?? 0);
  for (const match of raw.matchAll(/[^\s,]+/g)) {
    if (locals.has(match[0])) continue;
    diagnostics.push({
      messageText: `Class '${match[0]}' is not defined in this file.`,
      start: valueStart + match.index,
      length: match[0].length,
      code: DiagnosticCode.UnknownComposes,
    });
  }
}

const maxSnippetLines = 12;

/** Builds the hover documentation for a name: its doc comment, then the CSS that declares it. */
function describe(node: Rule | AtRule): string {
  let docs = "";
  const previous: ChildNode | undefined = node.prev();
  if (previous?.type === "comment" && previous.text.startsWith("*")) {
    docs = previous.text
      .slice(1)
      .split("\n")
      .map((line) => line.replace(/^\s*\*?\s?/, ""))
      .join("\n")
      .trim();
  }
  const css =
    node.type === "atrule"
      ? `@${node.name} ${node.params}`
      : node.clone({ raws: { ...node.raws, before: "" } }).toString();
  let lines = css.split("\n");
  if (lines.length > maxSnippetLines) lines = [...lines.slice(0, maxSnippetLines), "…"];
  const snippet = "```css\n" + lines.join("\n") + "\n```";
  return docs ? `${docs}\n\n${snippet}` : snippet;
}

interface Export {
  key: string;
  local: Local;
}

function exportsOf(locals: Local[], convention: LocalsConvention | null | undefined): Export[] {
  const exports = new Map<string, Export>();
  for (const local of locals) {
    for (const key of convertName(local.name, convention)) {
      if (!exports.has(key)) exports.set(key, { key, local });
    }
  }
  return [...exports.values()];
}

function convertName(name: string, convention: LocalsConvention | null | undefined): string[] {
  switch (convention) {
    case "camelCase":
      return [name, camelCase(name)];
    case "camelCaseOnly":
      return [camelCase(name)];
    case "dashes":
      return [name, dashesCamelCase(name)];
    case "dashesOnly":
      return [dashesCamelCase(name)];
    default:
      return [name];
  }
}

/** Matches `lodash.camelcase`, which `postcss-modules` uses, for ASCII names. */
export function camelCase(name: string): string {
  const words = name.match(/[A-Z]{2,}(?=[A-Z][a-z]|[^A-Za-z]|$)|[A-Z]?[a-z]+|[A-Z]+|\d+/g) ?? [];
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

export function dashesCamelCase(name: string): string {
  return name.replace(/-+(\w)/g, (_, letter: string) => letter.toUpperCase());
}

const reservedWords = new Set(
  (
    "arguments await break case catch class const continue debugger default delete do else enum " +
    "eval export extends false finally for function if implements import in instanceof interface " +
    "let new null package private protected public return static super switch this throw true " +
    "try typeof undefined var void while with yield"
  ).split(" "),
);

function isBindingName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !reservedWords.has(name);
}

function render(
  locals: Local[],
  options: TransformOptions,
): { text: string; mappings: SpanMapping[] } {
  const exports = exportsOf(locals, options.localsConvention);
  const mappings: SpanMapping[] = [];
  let text = "";

  const emit = (chunk: string) => {
    text += chunk;
  };
  const emitKey = (key: string, local: Local) => {
    mappings.push([
      text.length,
      key.length,
      local.start,
      local.length,
      SpanMapKind.Alias,
      mappingFeatures,
    ]);
    emit(key);
  };

  if (options.defaultExport !== false) {
    let binding = "styles";
    while (exports.some((entry) => entry.key === binding)) binding = `_${binding}`;
    emit(`declare const ${binding}: {\n`);
    for (const { key, local } of exports) {
      emit(jsdoc(local.docs, "  ") + "  readonly ");
      emitKey(isBindingName(key) ? key : JSON.stringify(key), local);
      emit(": string;\n");
    }
    emit(`};\nexport default ${binding};\n`);
  }

  if (options.namedExports !== false) {
    for (const { key, local } of exports) {
      if (!isBindingName(key)) continue;
      emit(jsdoc(local.docs, "") + "export declare const ");
      emitKey(key, local);
      emit(": string;\n");
    }
  }

  if (!text) emit("export {};\n");
  return { text, mappings };
}

function jsdoc(docs: string, indent: string): string {
  const lines = docs.replaceAll("*/", "*\\/").split("\n");
  return (
    `${indent}/**\n` +
    lines.map((line) => `${indent} *${line ? ` ${line}` : ""}`).join("\n") +
    `\n${indent} */\n`
  );
}
