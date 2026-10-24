import { describe, expect, it } from "vitest";

import { parseOptions } from "../src/index.ts";

describe("parseOptions", () => {
  it("accepts valid options", () => {
    expect(
      parseOptions({ localsConvention: "camelCaseOnly", namedExports: false, defaultExport: true }),
    ).toEqual({
      options: { localsConvention: "camelCaseOnly", namedExports: false, defaultExport: true },
      optionDiagnostics: [],
    });
  });

  it("reports invalid options by their path", () => {
    const { options, optionDiagnostics } = parseOptions({
      localsConvention: "kebab",
      namedExports: "yes",
    });
    expect(options).toEqual({});
    expect(optionDiagnostics.map((diagnostic) => diagnostic.path)).toEqual([
      ["localsConvention"],
      ["namedExports"],
    ]);
    expect(optionDiagnostics[0].messageText).toBe(
      "'localsConvention' must be one of 'camelCase', 'camelCaseOnly', 'dashes', 'dashesOnly'.",
    );
  });
});
