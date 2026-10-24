import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = resolve(root, "e2e/fixtures");

// Both compilers must report the same diagnostics for every fixture.
const compilers = {
  tsc: resolve(root, "node_modules/.bin/tsc"),
  tsrs: resolve(root, "node_modules/.bin/tsrs"),
};

const expected: Record<string, string> = {
  valid: "",
  nodenext: "",
  "type-errors": [
    `src/app.ts(1,18): error TS2614: Module '"./button.module.css"' has no exported member 'dark'. Did you mean to use 'import dark from "./button.module.css"' instead?`,
    `src/app.ts(3,39): error TS2339: Property 'buttonSecondary' does not exist on type '{ readonly button: string; readonly "button-primary": string; readonly buttonPrimary: string; readonly "fade-in": string; readonly fadeIn: string; }'.`,
    `src/app.ts(4,38): error TS2339: Property 'dark' does not exist on type '{ readonly button: string; readonly "button-primary": string; readonly buttonPrimary: string; readonly "fade-in": string; readonly fadeIn: string; }'.`,
    `src/app.ts(5,14): error TS2322: Type 'string' is not assignable to type 'number'.`,
  ].join("\n"),
  "css-errors": [
    `src/card.module.css(2,13): error css-modules2: Class 'surface' is not defined in this file.`,
    `src/card.module.css(5,1): error css-modules1: Unclosed block`,
  ].join("\n"),
  "invalid-options": `tsconfig.json(14,40): error css-modules1: 'localsConvention' must be one of 'camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'.`,
};

const run = promisify(execFile);

async function check(bin: string, fixture: string, args = ["--runExternalCode"]) {
  const cwd = resolve(fixtures, fixture);
  try {
    const { stdout } = await run(bin, [...args, "-p", ".", "--pretty", "false"], { cwd });
    return { code: 0, output: stdout.trim() };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { code, output: stdout.trim() };
  }
}

beforeAll(() => {
  const server = resolve(root, "packages/typed-css-modules-mapper/dist/server.mjs");
  if (!existsSync(server)) throw new Error("Build the mapper first: pnpm build");
});

describe.each(Object.entries(compilers))("%s", (_, bin) => {
  it.each(Object.entries(expected))("checks the %s fixture", async (fixture, output) => {
    const result = await check(bin, fixture);
    expect(result.output).toBe(output);
    expect(result.code).toBe(output ? 2 : 0);
  });

  it("refuses to run the mapper without --runExternalCode", async () => {
    const result = await check(bin, "valid", []);
    expect(result.output).toContain("error TS18068");
  });
});
