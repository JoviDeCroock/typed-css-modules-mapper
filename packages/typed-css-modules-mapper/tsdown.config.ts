import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts", "src/server.ts"],
  format: "esm",
  dts: { oxc: {} },
});
