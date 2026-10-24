import { describe, expect, it } from "vitest";

import { camelCase, DiagnosticCode, transform } from "../src/index.ts";
import type { TransformOptions } from "../src/index.ts";

/** Pairs every mapped virtual span with the CSS it points at. */
function mapped(css: string, options?: TransformOptions): [string, string][] {
  const { text, mappings = [] } = transform(css, options);
  return mappings.map(([virtualStart, virtualLength, originalStart, originalLength]) => [
    text.slice(virtualStart, virtualStart + virtualLength),
    css.slice(originalStart, originalStart + originalLength),
  ]);
}

function keys(css: string, options?: TransformOptions): string[] {
  return mapped(css, { namedExports: false, ...options }).map(([key]) => key);
}

describe("transform", () => {
  it("types classes as a default export and as named exports", () => {
    const result = transform(".button { color: red; }\n.button-primary { color: blue; }\n");
    expect(result.extension).toBe(".ts");
    expect(result.diagnostics).toBeUndefined();
    expect(result.text).toMatchInlineSnapshot(`
      "declare const styles: {
        /**
         * \`\`\`css
         * .button { color: red; }
         * \`\`\`
         */
        readonly button: string;
        /**
         * \`\`\`css
         * .button-primary { color: blue; }
         * \`\`\`
         */
        readonly "button-primary": string;
      };
      export default styles;
      /**
       * \`\`\`css
       * .button { color: red; }
       * \`\`\`
       */
      export declare const button: string;
      "
    `);
  });

  it("maps every export back to the name in the CSS", () => {
    expect(mapped(".a {}\n.b-c {}\n#d {}\n")).toEqual([
      ["a", "a"],
      ['"b-c"', "b-c"],
      ["d", "d"],
      ["a", "a"],
      ["d", "d"],
    ]);
  });

  it("maps to the first declaration of a name", () => {
    const css = ".a {}\n@media (width > 1px) { .a {} }\n";
    const { mappings = [] } = transform(css, { namedExports: false });
    expect(mappings).toHaveLength(1);
    expect(mappings[0][2]).toBe(1);
  });

  it("collects classes from compound, nested, and functional selectors", () => {
    const css = `
      .a.b > .c:hover, .d:not(.e) {}
      .f { &.g {} .h & {} }
      @media print { @supports (display: grid) { .i:is(.j, .k) {} } }
    `;
    expect(keys(css)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]);
  });

  it("skips names scoped with :global", () => {
    const css = `
      :global(.a) .b {}
      :global .c .d :local(.e) {}
      .f :global .g, .h {}
      :global(.i, .j) {}
      :local .k {}
    `;
    expect(keys(css)).toEqual(["b", "e", "f", "h", "k"]);
  });

  it("unescapes names and maps them to the escaped CSS", () => {
    expect(mapped(".sm\\:flex {}", { namedExports: false })).toEqual([['"sm:flex"', "sm\\:flex"]]);
  });

  it("maps names inside selectors with comments", () => {
    expect(mapped(".a /* note */ .b {}", { namedExports: false })).toEqual([
      ["a", "a"],
      ["b", "b"],
    ]);
  });

  it("types local keyframes but not their steps", () => {
    const css = `
      @keyframes fade { from { opacity: 0 } 50% { opacity: .5 } }
      @-webkit-keyframes :local(slide) {}
      @keyframes :global(spin) {}
    `;
    expect(mapped(css, { namedExports: false })).toEqual([
      ["fade", "fade"],
      ["slide", "slide"],
    ]);
  });

  it("keeps reserved words and invalid identifiers out of named exports", () => {
    const { text } = transform(".default {} .class {} .ok {} .not-ok {}");
    expect(text).toContain('  readonly "not-ok": string;');
    expect(text).toContain('  readonly "default": string;');
    expect(text).toContain("export declare const ok: string;");
    expect(text).not.toContain("export declare const default");
    expect(text).not.toContain("export declare const class");
  });

  it("renames the default export binding when a class takes its name", () => {
    const { text } = transform(".styles {} ._styles {}");
    expect(text).toContain("declare const __styles: {");
    expect(text).toContain("export default __styles;");
  });

  it("can drop either export form", () => {
    expect(transform(".a {}", { defaultExport: false }).text).not.toContain("export default");
    expect(transform(".a {}", { namedExports: false }).text).not.toContain("export declare");
    expect(transform(".a {}", { namedExports: false, defaultExport: false }).text).toBe(
      "export {};\n",
    );
  });

  it("turns a file without local names into an empty object", () => {
    expect(transform(":global(.a) {}", { namedExports: false }).text).toBe(
      "declare const styles: {\n};\nexport default styles;\n",
    );
  });

  it("documents names with their doc comment", () => {
    const { text } = transform("/**\n * Primary action.\n */\n.cta { color: red }\n", {
      namedExports: false,
    });
    expect(text).toContain("   * Primary action.\n   *\n   * ```css\n   * .cta { color: red }");
  });

  it("keeps comment terminators in rules from closing the doc comment", () => {
    const { text } = transform('.a { content: "*/"; }', { namedExports: false });
    expect(text).toContain('content: "*\\/"');
  });

  it("truncates long rules in documentation", () => {
    const css = `.a {\n${Array.from({ length: 20 }, (_, i) => `  --v${i}: ${i};`).join("\n")}\n}`;
    const { text } = transform(css, { namedExports: false });
    expect(text).toContain("--v10: 10;");
    expect(text).not.toContain("--v11: 11;");
    expect(text).toContain("   * …\n");
  });
});

describe("localsConvention", () => {
  const css = ".btn-primary {} .icon_large {} .XMLHttp {}";

  it("keeps names as written by default", () => {
    expect(keys(css)).toEqual(['"btn-primary"', "icon_large", "XMLHttp"]);
  });

  it("supports camelCase", () => {
    expect(keys(css, { localsConvention: "camelCase" })).toEqual([
      '"btn-primary"',
      "btnPrimary",
      "icon_large",
      "iconLarge",
      "XMLHttp",
      "xmlHttp",
    ]);
  });

  it("supports camelCaseOnly", () => {
    expect(keys(css, { localsConvention: "camelCaseOnly" })).toEqual([
      "btnPrimary",
      "iconLarge",
      "xmlHttp",
    ]);
  });

  it("supports dashes", () => {
    expect(keys(css, { localsConvention: "dashes" })).toEqual([
      '"btn-primary"',
      "btnPrimary",
      "icon_large",
      "XMLHttp",
    ]);
  });

  it("supports dashesOnly", () => {
    expect(keys(css, { localsConvention: "dashesOnly" })).toEqual([
      "btnPrimary",
      "icon_large",
      "XMLHttp",
    ]);
  });

  it("maps converted names to the original name", () => {
    expect(mapped(".btn-primary {}", { localsConvention: "camelCaseOnly" })).toEqual([
      ["btnPrimary", "btn-primary"],
      ["btnPrimary", "btn-primary"],
    ]);
  });

  it("converts names the way lodash.camelcase does", () => {
    expect(camelCase("foo-bar")).toBe("fooBar");
    expect(camelCase("foo--bar__baz")).toBe("fooBarBaz");
    expect(camelCase("FooBar")).toBe("fooBar");
    expect(camelCase("btn2x")).toBe("btn2X");
    expect(camelCase("HTMLElement")).toBe("htmlElement");
    expect(camelCase("a-B-c")).toBe("aBC");
  });
});

describe("diagnostics", () => {
  it("reports syntax errors and keeps the names it could recover", () => {
    const css = ".a { color: red; }\n.b { color: blue;\n";
    const result = transform(css, { namedExports: false });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: DiagnosticCode.SyntaxError, messageText: "Unclosed block" }),
    ]);
    const [diagnostic] = result.diagnostics!;
    expect(css.slice(diagnostic.start, diagnostic.start + diagnostic.length)).toBe(".");
    expect(result.text).toContain("readonly a: string;");
    expect(result.text).toContain("readonly b: string;");
  });

  it("reports local composes of unknown classes", () => {
    const css = ".a { composes: b missing; }\n.b {}\n";
    const result = transform(css);
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics!;
    expect(diagnostic.code).toBe(DiagnosticCode.UnknownComposes);
    expect(diagnostic.messageText).toBe("Class 'missing' is not defined in this file.");
    expect(css.slice(diagnostic.start, diagnostic.start + diagnostic.length)).toBe("missing");
  });

  it("does not check composes from other files or global scope", () => {
    const css = `.a { composes: b from "./other.module.css"; composes: c from global; }`;
    expect(transform(css).diagnostics).toBeUndefined();
  });
});
