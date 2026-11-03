import postcss from "postcss";
import type { AcceptedPlugin } from "postcss";
import postcssCustomSelectors from "postcss-custom-selectors";
import postcssModules from "postcss-modules";
import { describe, expect, it } from "vitest";

import { transform } from "../src/index.ts";

// The mapper must export the same names as postcss-modules, which Vite and many other tools run.
const cases: Record<string, string> = {
  classes: ".a.b > .c:hover, .d:not(.e) {} #id.f {}",
  nesting: ".a { .b {} &:hover .c {} }",
  atRules: "@media print { @supports (display: grid) { .a {} } } @layer x { .b {} }",
  global: ":global(.a) .b {} :global .c :local(.d) {} .e:not(:global(.f)) {}",
  upperGlobal: ":GLOBAL(.a) .b {}",
  escapes: ".\\31 23 {} .sm\\:flex {} .café {} .🍕 {}",
  keyframes:
    "@keyframes a {} @-webkit-keyframes b {} @keyframes :global(c) {} @keyframes :local(d) {}",
  icssExport: ":export { primaryColor: red; my-key: 1 }",
  values: "@value primary: red;\n@value small (max-width: 1px);\n@value empty;",
  scope: "@scope (.card) to (.content) { .item {} }",
  crlf: ".a {\r\n  color: red;\r\n}\r\n.b {}\r\n",
  bom: "﻿.a {} .b {}",
  composes: ".base {} .a { composes: base; }",
};

// postcss-preset-env expands custom selectors before CSS Modules sees the file.
const customSelectorCases: Record<string, string> = {
  customSelectors: "@custom-selector :--a .a, .b:hover; .c:--a {}",
  nestedCustomSelectors:
    "@custom-selector :--a .a; @custom-selector :--b\n  :has(.b):not(:has(:--a)); .c:--b {}",
  unusedCustomSelector: "@custom-selector :--a .a; .b {}",
  redefinedCustomSelector: "@custom-selector :--a .a; @custom-selector :--a .b; .c:--a {}",
  globalCustomSelector: "@custom-selector :--a .a :global(.b); :global .c :--a {} .d :--a {}",
};

async function postcssModulesNames(css: string, plugins: AcceptedPlugin[] = []): Promise<string[]> {
  let names: string[] = [];
  await postcss([
    ...plugins,
    postcssModules({
      getJSON: (_, json) => {
        names = Object.keys(json);
      },
    }),
  ]).process(css, { from: "test.module.css" });
  return names.sort();
}

function mapperNames(css: string): string[] {
  const { text, mappings = [] } = transform(css, { namedExports: false });
  const names = mappings.map(([start, length]) => {
    const key = text.slice(start, start + length);
    return key.startsWith('"') ? (JSON.parse(key) as string) : key;
  });
  return names.sort();
}

describe("parity with postcss-modules", () => {
  it.each(Object.entries(cases))("exports the same names for %s", async (_, css) => {
    expect(mapperNames(css)).toEqual(await postcssModulesNames(css));
  });

  it.each(Object.entries(customSelectorCases))(
    "exports the same names for %s after postcss-custom-selectors",
    async (_, css) => {
      const plugins = [postcssCustomSelectors({ preserve: false })];
      expect(mapperNames(css)).toEqual(await postcssModulesNames(css, plugins));
    },
  );
});
