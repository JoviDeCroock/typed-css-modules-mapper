import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

it("keeps the repository README in sync with the package README", () => {
  const pkg = read("../README.md");
  const docs = pkg.slice(0, pkg.indexOf("## License"));
  expect(read("../../../README.md").startsWith(docs)).toBe(true);
});
