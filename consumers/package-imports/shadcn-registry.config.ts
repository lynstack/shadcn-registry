import { defineConfig } from "@lynstack/shadcn-registry";
import type { ItemDetails, ItemInfo } from "@lynstack/shadcn-registry";

/** Title and description from an entry's `Name: what it does.` documentation. */
function describe({ documentation }: ItemInfo): ItemDetails {
  const match = /^(?<title>[\w ]+): (?<what>.+)$/u.exec(documentation ?? "");
  const title = match?.groups?.["title"];
  const what = match?.groups?.["what"];
  return title === undefined || what === undefined
    ? {}
    : { description: `${what.charAt(0).toUpperCase()}${what.slice(1)}`, title };
}

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
      describe,
    },
    {
      source: "src/components/{item}",
      type: "registry:component",
      target: "@components",
      describe,
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
