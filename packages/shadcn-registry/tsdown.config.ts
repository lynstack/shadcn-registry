import { defineConfig } from "tsdown";

export default defineConfig({
  attw: { profile: "esm-only" },
  dts: { generator: "oxc" },
  entry: ["src/index.ts", "src/cli.ts"],
  failOnWarn: true,
  platform: "node",
  publint: { strict: true },
  sourcemap: true,
  target: "node24",
  tsconfig: "tsconfig.build.json",
});
