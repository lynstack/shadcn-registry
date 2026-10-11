import { describe, expect, it } from "vitest";

import type { ItemDetails } from "./config.ts";

import { build, createProject } from "#test/project.ts";

const files = {
  "src/components/ui/button/button.tsx": `export function Button() { return ""; }\n`,
  "src/components/ui/button/index.ts": `/**
 * Triggers an action.
 *
 * @packageDocumentation
 */
export { Button } from "./button";
`,
  "src/lib/utils.ts": `/**
 * Joins class names.
 *
 * @category utility
 * @packageDocumentation
 */
export function cn(...names: string[]) { return names.join(" "); }
`,
};

describe("item details", () => {
  it("describes each item by the TSDoc comment of its entry", () => {
    const output = build(createProject(files));

    expect(output.get("button.json")).toMatchObject({
      description: "Triggers an action.",
      title: "Button",
    });
    expect(output.get("utils.json")).toMatchObject({
      categories: ["utility"],
      description: "Joins class names.",
      title: "Utils",
    });
  });

  it("reads no documentation from a file of a folder item but its index", () => {
    const output = build(
      createProject({
        "src/components/ui/card/card.tsx": `/**
 * Not the entry.
 * @packageDocumentation
 */
export const card = 1;
`,
      }),
    );

    expect(output.get("card.json")).not.toHaveProperty("description");
  });

  it("reads no documentation from an entry that is not a script", () => {
    const output = build(
      createProject({
        "src/components/ui/tokens/index.css":
          "/**\n * Not read.\n * @packageDocumentation\n */\n",
      }),
    );

    expect(output.get("tokens.json")).not.toHaveProperty("description");
  });

  it("lets describe replace each field the documentation gives", () => {
    const output = build(createProject(files), {
      items: [
        {
          describe: ({ documentation, files: paths }): ItemDetails => ({
            categories: ["action"],
            docs: `${String(documentation.description)} (${String(paths.length)} files)`,
          }),
          source: "src/components/ui/{item}",
          target: "@ui",
          type: "registry:ui",
        },
        { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
      ],
    });

    expect(output.get("button.json")).toMatchObject({
      categories: ["action"],
      description: "Triggers an action.",
      docs: "Triggers an action. (2 files)",
    });
  });
});
