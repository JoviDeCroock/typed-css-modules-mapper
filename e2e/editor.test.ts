import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startServer } from "./lsp.ts";
import type { Location, Server } from "./lsp.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "e2e/fixtures/valid");
const app = resolve(fixture, "src/app.ts");
const css = pathToFileURL(resolve(fixture, "src/button.module.css")).href;

// tsrs 0.18 runs content mappers from the command line only; its language server doesn't load them.
describe("tsc language server", () => {
  let server: Server;

  beforeAll(async () => {
    server = await startServer(resolve(root, "node_modules/.bin/tsc"), fixture);
    server.open(app);
  });

  afterAll(() => server.close());

  it("goes to the class definition from a property access", async () => {
    // `styles.button` on line 5
    const locations = await server.request<Location[]>("textDocument/definition", app, {
      line: 4,
      character: 10,
    });
    expect(locations).toEqual([
      { uri: css, range: { start: { line: 1, character: 1 }, end: { line: 1, character: 7 } } },
    ]);
  });

  it("goes to the original class definition from a converted named import", async () => {
    // `buttonPrimary` on line 1
    const locations = await server.request<Location[]>("textDocument/definition", app, {
      line: 0,
      character: 26,
    });
    expect(locations).toEqual([
      { uri: css, range: { start: { line: 6, character: 1 }, end: { line: 6, character: 15 } } },
    ]);
  });

  it("completes every name after the default import", async () => {
    // `styles.` on line 5
    const result = await server.request<{ items: { label: string }[] } | { label: string }[]>(
      "textDocument/completion",
      app,
      { line: 4, character: 9 },
    );
    const items = Array.isArray(result) ? result : result.items;
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["button", "button-primary", "buttonPrimary", "fade-in", "fadeIn"]),
    );
  });

  it("shows the doc comment and the rule on hover", async () => {
    const hover = await server.request<{ contents: { value: string } }>("textDocument/hover", app, {
      line: 4,
      character: 10,
    });
    expect(hover.contents.value).toContain("The main call to action.");
    expect(hover.contents.value).toContain("```css\n.button {\n  color: white;");
  });
});
