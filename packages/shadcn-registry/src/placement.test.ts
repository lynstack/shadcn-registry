import { describe, expect, it } from "vitest";

import type { Config, ItemRule } from "./config.ts";

import { build, createProject, problemsOf } from "#test/project.ts";

const helpersAsLib: readonly ItemRule[] = [
  { source: "src/components/ui/{item}", target: "@ui", type: "registry:ui" },
  { source: "src/helpers/{item}.ts", target: "@lib", type: "registry:lib" },
];

const copyHint =
  "the CLI looks up only import statements among the files it writes, so match the source folders to the targets.";

describe("relative imports", () => {
  it("accepts one that names the same module once installed", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { tone } from "./parts/tone";\nexport const badge = tone;\n`,
      "src/components/ui/badge/parts/tone.ts": "export const tone = 1;\n",
    });

    expect([...build(root).keys()]).toContain("badge.json");
  });

  it("refuses one into a folder that installs elsewhere", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { size } from "../../../lib/size";\nexport const badge = size;\n`,
      "src/lib/size.ts": "export const size = 1;\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/badge/badge.tsx:1 "../../../lib/size" no longer names src/lib/size.ts once installed, as @ui/badge/badge.tsx and @lib/size.ts; the shadcn CLI never rewrites a relative import, so import it through an alias such as #/ or @/.`,
    ]);
  });

  it("follows one to a declaration file", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import type { Tone } from "./types";\nexport const badge: Tone = 1;\n`,
      "src/components/ui/badge/types.d.ts": "export type Tone = number;\n",
    });

    expect(build(root).get("badge.json")?.["files"]).toHaveLength(2);
  });
});

describe("alias imports", () => {
  it("refuses an alias other than @/ and #/, which the CLI does not rewrite", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { size } from "~/lib/size";\nexport const badge = size;\n`,
      "src/lib/size.ts": "export const size = 1;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { module: "preserve", paths: { "~/*": ["./src/*"] } },
      }),
    });

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/badge/badge.tsx:1 "~/lib/size" is a local import the shadcn CLI does not rewrite; name it with a relative path, #/ or @/.`,
    ]);
  });

  it.each([
    ["src/components/ui/badge/badge.jsx", {}],
    ["src/components/ui/badge/badge.mts", {}],
    ["src/components/ui/badge/badge.d.ts", {}],
    [
      "src/components/ui/badge/badge.ts",
      {
        items: [
          {
            source: "src/components/ui/{item}",
            target: "~/badge",
            type: "registry:file",
          },
          { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
        ],
      },
    ],
  ] as const)(
    "refuses one in %s, whose imports the CLI copies as they are",
    (file, config) => {
      const root = createProject({
        [file]: `import { size } from "@/lib/size";\nexport const badge = size;\n`,
        "src/lib/size.ts": "export const size = 1;\n",
      });

      expect(problemsOf(root, config)).toStrictEqual([
        `${file}:1 "@/lib/size" is an alias import in a file whose imports the shadcn CLI copies as they are (a registry:file, JavaScript, .mts or .d.ts); use a relative path.`,
      ]);
    },
  );

  it("accepts export … from, import() and import types whose folders match the target", () => {
    const root = createProject({
      "src/components/ui/badge/index.ts": `export { size } from "#/lib/size";\nexport const load = () => import("#/lib/tone");\nexport type T = import("@/lib/kind").Kind;\n`,
      "src/lib/kind.ts": "export type Kind = 1;\n",
      "src/lib/size.ts": "export const size = 1;\n",
      "src/lib/tone.ts": "export const tone = 1;\n",
    });

    expect(
      build(root).get("badge.json")?.["registryDependencies"],
    ).toStrictEqual(["@acme/kind", "@acme/size", "@acme/tone"]);
  });

  it("refuses export … from and import() whose folders differ from the target", () => {
    const root = createProject({
      "src/components/ui/badge/index.ts": `export { size } from "@/helpers/size";\nexport const load = () => import("@/helpers/size");\n`,
      "src/helpers/size.ts": "export const size = 1;\n",
    });

    expect(problemsOf(root, { items: helpersAsLib })).toStrictEqual([
      `src/components/ui/badge/index.ts:1 "@/helpers/size" names no folder the shadcn CLI knows once installed, but src/helpers/size.ts is installed as @lib/size.ts; ${copyHint}`,
      `src/components/ui/badge/index.ts:2 "@/helpers/size" names no folder the shadcn CLI knows once installed, but src/helpers/size.ts is installed as @lib/size.ts; ${copyHint}`,
    ]);
  });

  it("accepts an import statement whose folders differ, which the CLI looks up by name", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { size } from "@/helpers/size";\nexport const badge = size;\n`,
      "src/helpers/size.ts": "export const size = 1;\n",
    });

    expect([...build(root, { items: helpersAsLib }).keys()]).toContain(
      "size.json",
    );
  });

  it("refuses an import statement with an extension the CLI cannot look up, whose folders differ", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { size } from "@/helpers/size.js";\nexport const badge = size;\n`,
      "src/helpers/size.ts": "export const size = 1;\n",
    });

    expect(problemsOf(root, { items: helpersAsLib })).toStrictEqual([
      `src/components/ui/badge/badge.tsx:1 "@/helpers/size.js" names no folder the shadcn CLI knows once installed, but src/helpers/size.ts is installed as @lib/size.ts; the CLI finds no module of that name among the files it writes, so match the source folders to the targets.`,
    ]);
  });

  const barrels = {
    "src/components/ui/button/button.tsx": "export const button = 1;\n",
    "src/components/ui/button/index.ts": `export { button } from "./button";\n`,
    "src/components/ui/dialog/index.ts": `export { dialog } from "./dialog";\n`,
  };

  it("accepts index files that share their name across items", () => {
    const root = createProject({
      ...barrels,
      "src/components/ui/dialog/dialog.tsx": `import { button } from "#/components/ui/button/button";\nexport const dialog = button;\n`,
    });

    expect(
      build(root).get("dialog.json")?.["registryDependencies"],
    ).toStrictEqual(["@acme/button"]);
  });

  it("refuses an import of a folder's index that the lookup trades for the folder's module of the same name", () => {
    const root = createProject({
      ...barrels,
      "src/components/ui/dialog/dialog.tsx": `import { button } from "#/components/ui/button";\nexport const dialog = button;\n`,
    });

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/dialog/dialog.tsx:1 "#/components/ui/button" names src/components/ui/button/index.ts, but the shadcn CLI resolves it to @ui/button/button.tsx, which the same install writes and its lookup prefers; import the module itself, or rename one of them.`,
    ]);
  });

  it("accepts a module whose name another item shares, outside the install", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { size } from "@/lib/size";\nexport const badge = size;\n`,
      "src/components/ui/card/size.tsx": "export const size = 2;\n",
      "src/lib/size.ts": "export const size = 1;\n",
    });

    expect([...build(root).keys()]).toContain("badge.json");
  });

  it("refuses a module the CLI's lookup passes over for another of its name in the same install", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { card } from "@/components/ui/card/card";\nimport { size } from "@/lib/size";\nexport const badge = [card, size];\n`,
      "src/components/ui/card/card.tsx": "export const card = 1;\n",
      "src/components/ui/card/size.tsx": "export const size = 2;\n",
      "src/lib/size.ts": "export const size = 1;\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/badge/badge.tsx:2 "@/lib/size" names src/lib/size.ts, but the shadcn CLI resolves it to @ui/card/size.tsx, which the same install writes and its lookup prefers; import the module itself, or rename one of them.`,
    ]);
  });
});

/** The rules of a component that depends on `registryDependencies`. */
const dependentRules = (
  registryDependencies: readonly string[],
): Partial<Config> => ({
  items: [
    {
      source: "src/components/ui/{item}",
      target: "@ui",
      type: "registry:ui",
    },
    {
      registryDependencies,
      source: "src/components/{item}",
      target: "@components",
      type: "registry:component",
    },
    { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
  ],
});

describe("installs with the items a rule depends on", () => {
  it("checks the lookup against the files of an item a rule names, by name or by address", () => {
    const root = createProject({
      "src/components/badge/badge.tsx": `import { size } from "@/lib/size";\nexport const badge = size;\n`,
      "src/components/ui/card/size.tsx": "export const size = 2;\n",
      "src/lib/size.ts": "export const size = 1;\n",
    });
    const problem = `src/components/badge/badge.tsx:1 "@/lib/size" names src/lib/size.ts, but the shadcn CLI resolves it to @ui/card/size.tsx, which the same install writes and its lookup prefers; import the module itself, or rename one of them.`;

    expect(problemsOf(root, dependentRules(["card"]))).toStrictEqual([problem]);
    expect(problemsOf(root, dependentRules(["@acme/card"]))).toStrictEqual([
      problem,
    ]);
  });

  it("leaves out an item a rule makes depend on itself", () => {
    const root = createProject({
      "src/components/badge/badge.tsx": "export const badge = 1;\n",
    });

    expect(
      build(root, dependentRules(["badge"])).get("badge.json"),
    ).not.toHaveProperty("registryDependencies");
  });
});
