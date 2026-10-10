import { defineConfig } from "@lynstack/shadcn-registry";

export default defineConfig({
  name: "app-layout",
  homepage: "https://example.com/app-layout",
  outDir: "public/r",
  items: [
    {
      source: "src/components/ui/{item}.tsx",
      type: "registry:ui",
      target: "@ui",
      registryDependencies: ["theme"],
    },
    { source: "src/hooks/{item}.ts", type: "registry:hook", target: "@hooks" },
    { source: "src/lib/{item}.ts", type: "registry:lib", target: "@lib" },
  ],
  themes: [
    {
      name: "theme",
      type: "registry:theme",
      sources: ["src/styles/globals.css"],
    },
  ],
});
