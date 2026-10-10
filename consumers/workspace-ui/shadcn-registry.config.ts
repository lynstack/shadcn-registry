import { defineConfig } from "@lynstack/shadcn-registry";

export default defineConfig({
  name: "workspace-ui",
  homepage: "https://example.com/workspace-ui",
  outDir: "public/r",
  items: [
    {
      source: "src/components/ui/{item}.tsx",
      type: "registry:ui",
      target: "@ui",
    },
  ],
});
