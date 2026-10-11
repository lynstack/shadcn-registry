import { defineConfig } from "@lynstack/shadcn-registry";

export default defineConfig({
  name: "package-imports",
  homepage: "https://example.com/package-imports",
  url: "https://example.com/package-imports/r/{name}.json",
  outDir: "public/r",
  installPeers: ["@base-ui/react"],
  items: [
    {
      source: "src/components/ui/{item}",
      type: "registry:ui",
      target: "@ui",
      registryDependencies: ["style"],
    },
    {
      source: "src/components/{item}",
      type: "registry:component",
      target: "@components",
    },
    { source: "src/lib/{item}", type: "registry:lib", target: "@lib" },
  ],
  themes: [
    {
      name: "style",
      type: "registry:style",
      extends: "none",
      description: "The tokens, the Tailwind theme and the base styles.",
      sources: [
        "src/theme/tokens.css",
        "src/theme/theme.css",
        "src/theme/base.css",
      ],
    },
  ],
});
