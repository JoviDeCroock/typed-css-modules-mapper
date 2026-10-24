import type { OptionDiagnostic } from "./protocol.ts";
import { localsConventions } from "./transform.ts";
import type { LocalsConvention, TransformOptions } from "./transform.ts";

/** Validates the `options` object of a `contentMappers` entry. */
export function parseOptions(input: Record<string, unknown>): {
  options: TransformOptions;
  optionDiagnostics: OptionDiagnostic[];
} {
  const options: TransformOptions = {};
  const optionDiagnostics: OptionDiagnostic[] = [];

  const { localsConvention } = input;
  if (localsConvention != null) {
    if (localsConventions.includes(localsConvention as LocalsConvention)) {
      options.localsConvention = localsConvention as LocalsConvention;
    } else {
      optionDiagnostics.push({
        path: ["localsConvention"],
        messageText: `'localsConvention' must be one of ${localsConventions.map((value) => `'${value}'`).join(", ")}.`,
        code: 1,
      });
    }
  }

  for (const key of ["namedExports", "defaultExport"] as const) {
    if (input[key] == null) continue;
    if (typeof input[key] === "boolean") {
      options[key] = input[key];
    } else {
      optionDiagnostics.push({
        path: [key],
        messageText: `'${key}' must be a boolean.`,
        code: 1,
      });
    }
  }

  return { options, optionDiagnostics };
}
