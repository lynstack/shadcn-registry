import { describe, expect, it } from "vitest";

import { build, createProject, problemsOf } from "#test/project.ts";
import type { ItemRule } from "./config.ts";

const ui: ItemRule = {
  source: "src/components/ui/{item}",
  target: "@ui",
  type: "registry:ui",
};

const files = {
  "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
  "src/components/ui/index.ts": `export { badge } from "./badge/badge";\n`,
};

describe("files in the folder of a folder rule", () => {
  it("refuses one that ships nowhere", () => {
    expect(problemsOf(createProject(files), { items: [ui] })).toStrictEqual([
      `src/components/ui/index.ts sits in the folder of "src/components/ui/{item}" but in no item's folder, so it ships nowhere; move it into an item's folder, or add it to ignore.`,
    ]);
  });

  it("refuses one a broader rule ships as an item of its own", () => {
    const broad: ItemRule = {
      source: "src/components/{item}",
      target: "@components",
      type: "registry:component",
    };

    expect(
      problemsOf(createProject(files), { items: [ui, broad] }),
    ).toStrictEqual([
      `src/components/ui/index.ts sits in the folder of "src/components/ui/{item}" but in no item's folder, so it ships as the item "ui"; move it into an item's folder, or add it to ignore.`,
      `src/components/ui/index.ts:1 "./badge/badge" no longer names src/components/ui/badge/badge.tsx once installed, as @components/ui/index.ts and @ui/badge/badge.tsx; the shadcn CLI never rewrites a relative import, so import it through an alias such as #/ or @/.`,
    ]);
  });

  it("accepts one the configuration ignores", () => {
    expect([
      ...build(createProject(files), {
        ignore: ["src/components/ui/index.ts"],
        items: [ui],
      }).keys(),
    ]).toStrictEqual(["badge.json", "registry.json"]);
  });

  it("accepts one a file rule makes an item of", () => {
    const fileRule: ItemRule = {
      source: "src/components/ui/{item}.ts",
      target: "@ui",
      type: "registry:ui",
    };

    expect([
      ...build(createProject(files), { items: [ui, fileRule] }).keys(),
    ]).toStrictEqual(["badge.json", "index.json", "registry.json"]);
  });
});

describe("sources with glob syntax in their folders", () => {
  const shop: ItemRule = {
    source: "src/app/[locale]/(shop)/{item}",
    target: "@components",
    type: "registry:component",
  };

  it("takes each character of a source as it is", () => {
    const root = createProject({
      "src/app/[locale]/(shop)/cart/cart.tsx": "export const cart = 1;\n",
      "src/app/a/(shop)/other/other.tsx": "export const other = 1;\n",
      "src/app/a/nav/nav.tsx": "export const nav = 1;\n",
      "src/app/{a,b}/menu/menu.tsx": "export const menu = 1;\n",
      "src/lib/[x]/size.ts": "export const size = 1;\n",
      "src/lib/x/other.ts": "export const other = 1;\n",
    });

    expect([
      ...build(root, {
        items: [
          shop,
          {
            source: "src/app/{a,b}/{item}",
            target: "@components",
            type: "registry:component",
          },
          {
            source: "src/lib/[x]/{item}.ts",
            target: "@lib",
            type: "registry:lib",
          },
        ],
      }).keys(),
    ]).toStrictEqual(["cart.json", "menu.json", "registry.json", "size.json"]);
  });

  it("finds a file directly in such a folder", () => {
    const root = createProject({
      "src/app/[locale]/(shop)/cart/cart.tsx": "export const cart = 1;\n",
      "src/app/[locale]/(shop)/layout.tsx": "export const layout = 1;\n",
    });

    expect(problemsOf(root, { items: [shop] })).toStrictEqual([
      `src/app/[locale]/(shop)/layout.tsx sits in the folder of "src/app/[locale]/(shop)/{item}" but in no item's folder, so it ships nowhere; move it into an item's folder, or add it to ignore.`,
    ]);
  });

  it("refuses a source with a backslash", () => {
    expect(
      problemsOf(createProject({}), {
        items: [{ source: "src\\{item}", target: "@ui", type: "registry:ui" }],
      }),
    ).toStrictEqual([
      ` The item source "src\\{item}" must separate its folders with forward slashes.`,
    ]);
  });
});
