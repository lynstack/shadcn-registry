import { describe, expect, it } from "vitest";

import type { ItemDetails } from "./config.ts";

import { build, createProject, problemsOf } from "#test/project.ts";

const button = {
  "src/components/ui/button/button.test.tsx": `import { Button } from "./button";\nButton();\n`,
  "src/components/ui/button/button.tsx": `import { cva } from "class-variance-authority";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";
export function Button() { return cn(cva("b")()) + Spinner(); }
`,
  "src/components/ui/button/index.ts": `/**
 * Button: triggers an action.
 *
 * @packageDocumentation
 */
export { Button } from "./button";
`,
  "src/components/ui/button/spinner.tsx": `export function Spinner() { return ""; }\n`,
  "src/lib/utils.ts": `export function cn(...names: string[]) { return names.join(" "); }\n`,
};

describe("items", () => {
  it("makes an item of each folder and each file a rule names, with their targets", () => {
    const output = build(createProject(button));

    expect([...output.keys()]).toStrictEqual([
      "button.json",
      "registry.json",
      "utils.json",
    ]);
    expect(output.get("button.json")).toMatchObject({
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      dependencies: ["class-variance-authority@^0.7.1"],
      files: [
        {
          path: "src/components/ui/button/button.tsx",
          target: "@ui/button/button.tsx",
          type: "registry:ui",
        },
        {
          path: "src/components/ui/button/index.ts",
          target: "@ui/button/index.ts",
          type: "registry:ui",
        },
        {
          path: "src/components/ui/button/spinner.tsx",
          target: "@ui/button/spinner.tsx",
          type: "registry:ui",
        },
      ],
      name: "button",
      registryDependencies: ["@acme/utils"],
      title: "Button",
      type: "registry:ui",
    });
    expect(output.get("utils.json")).toMatchObject({
      files: [{ path: "src/lib/utils.ts", target: "@lib/utils.ts" }],
      title: "Utils",
    });
  });

  it("inlines each file's content in the item, and leaves it out of registry.json", () => {
    const output = build(createProject(button));
    const item = output.get("button.json");
    const registry = output.get("registry.json");

    expect(item?.["files"]).toContainEqual(
      expect.objectContaining({
        content: button["src/components/ui/button/spinner.tsx"],
      }),
    );
    expect(JSON.stringify(registry)).not.toContain('"content"');
    expect(registry).toMatchObject({
      $schema: "https://ui.shadcn.com/schema/registry.json",
      homepage: "https://example.com",
      name: "acme",
    });
  });

  it("names the items an item imports by URL when the registry has one", () => {
    const output = build(createProject(button), {
      url: "https://example.com/r/{name}.json",
    });

    expect(output.get("button.json")?.["registryDependencies"]).toStrictEqual([
      "https://example.com/r/utils.json",
    ]);
  });

  it("names them by the namespace the configuration gives", () => {
    const output = build(createProject(button), { namespace: "@ui-kit" });

    expect(output.get("button.json")?.["registryDependencies"]).toStrictEqual([
      "@ui-kit/utils",
    ]);
  });

  it("passes the entry's documentation to describe", () => {
    const output = build(createProject(button), {
      items: [
        {
          describe: ({ documentation, files }): ItemDetails => ({
            description: `${String(documentation)} (${String(files.length)} files)`,
            docs: "Read me.",
          }),
          source: "src/components/ui/{item}",
          target: "@ui",
          type: "registry:ui",
        },
        { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
      ],
    });

    expect(output.get("button.json")).toMatchObject({
      description: "Button: triggers an action. (3 files)",
      docs: "Read me.",
    });
  });

  it("gives a file to the first rule whose source holds it", () => {
    const output = build(
      createProject({
        "src/components/card/card.tsx": "export const card = 1;\n",
        "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
      }),
      {
        items: [
          {
            source: "src/components/ui/{item}",
            target: "@ui",
            type: "registry:ui",
          },
          {
            source: "src/components/{item}",
            target: "@components",
            type: "registry:component",
          },
        ],
      },
    );

    expect([...output.keys()]).toStrictEqual([
      "badge.json",
      "card.json",
      "registry.json",
    ]);
  });

  it("adds the dependencies a rule names to each of its items", () => {
    const output = build(createProject(button), {
      items: [
        {
          registryDependencies: [
            "utils",
            "@shadcn/button",
            "https://x.dev/r/a.json",
          ],
          source: "src/components/ui/{item}",
          target: "@ui",
          type: "registry:ui",
        },
        { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
      ],
    });

    expect(output.get("button.json")?.["registryDependencies"]).toStrictEqual([
      "@acme/utils",
      "@shadcn/button",
      "https://x.dev/r/a.json",
    ]);
  });

  it("refuses a dependency on an item the registry lacks", () => {
    expect(
      problemsOf(createProject(button), {
        items: [
          {
            registryDependencies: ["style"],
            source: "src/components/ui/{item}",
            target: "@ui",
            type: "registry:ui",
          },
          { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
        ],
      }),
    ).toStrictEqual([
      ` An item rule depends on "style", which is no item of this registry; name another registry's item by its @namespace/name or URL.`,
    ]);
  });

  it("refuses an import of a file no item ships", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { tone } from "@/tones";\nexport const badge = tone;\n`,
      "src/tones.ts": "export const tone = 1;\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      "src/components/ui/badge/badge.tsx:1 imports src/tones.ts, which no item ships; add it to an item's source, or stop ignoring it.",
    ]);
  });

  it("refuses an import of an ignored file", () => {
    const root = createProject({
      "src/components/ui/badge/badge.stories.tsx": "export const fake = 1;\n",
      "src/components/ui/badge/badge.tsx": `import { fake } from "./badge.stories";\nexport const badge = fake;\n`,
    });

    expect(problemsOf(root)).toStrictEqual([
      "src/components/ui/badge/badge.tsx:1 imports src/components/ui/badge/badge.stories.tsx, which no item ships; add it to an item's source, or stop ignoring it.",
    ]);
  });

  it("refuses an import that resolves to nothing", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { gone } from "./gone";\nexport const badge = gone;\n`,
    });

    expect(problemsOf(root)).toStrictEqual([
      expect.stringMatching(
        /^src\/components\/ui\/badge\/badge\.tsx:1 cannot resolve "\.\/gone": /u,
      ),
    ]);
  });

  it("refuses names the shadcn CLI cannot take, and names two items share", () => {
    const root = createProject({
      "src/components/ui/Badge/badge.tsx": "export const badge = 1;\n",
      "src/lib/style.ts": "export const style = 1;\n",
      "theme.css": ":root { --radius: 1rem; }\n",
    });

    expect(
      problemsOf(root, {
        themes: [
          { name: "style", sources: ["theme.css"], type: "registry:style" },
        ],
      }),
    ).toStrictEqual([
      ` "Badge" cannot name an item: use lowercase letters, digits and single hyphens.`,
      ` Two items are named "style"; the shadcn CLI finds an item by its name, so rename one.`,
    ]);
  });

  it("refuses a source without one {item} in its last segment, and a target that leaves the app", () => {
    const root = createProject({});

    expect(
      problemsOf(root, {
        items: [
          { source: "src/{item}/ui", target: "@ui", type: "registry:ui" },
          { source: "src/{item}", target: "../outside", type: "registry:ui" },
          { source: "../src/{item}", target: "@ui", type: "registry:ui" },
        ],
      }),
    ).toStrictEqual([
      ` The item source "../src/{item}" must be a relative path inside the root.`,
      ` The item source "src/{item}/ui" must hold "{item}" once, in its last segment.`,
      ` The target "../outside" of "src/{item}" must be a path that stays inside the app.`,
    ]);
  });

  it("refuses a dynamic import of a computed name", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx":
        "const name = './x';\nexport const load = () => import(name);\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      "src/components/ui/badge/badge.tsx:2 imports a module whose name is computed; name it with a string literal so the build can follow it.",
    ]);
  });

  it("follows export … from and literal dynamic imports", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `export { tone } from "@/lib/tone";\nexport const load = () => import("@/lib/size");\n`,
      "src/lib/size.ts": "export const size = 1;\n",
      "src/lib/tone.ts": "export const tone = 1;\n",
    });

    expect(
      build(root).get("badge.json")?.["registryDependencies"],
    ).toStrictEqual(["@acme/size", "@acme/tone"]);
  });
});
