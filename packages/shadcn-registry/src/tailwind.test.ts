import { describe, expect, it } from "vitest";

import { build, createProject, problemsOf } from "#test/project.ts";
import type { ThemeItem } from "./config.ts";

const style: ThemeItem = {
  name: "style",
  sources: ["src/theme.css"],
  type: "registry:style",
};

describe("only Tailwind CSS 4 or later", () => {
  it("leaves out the import of Tailwind CSS itself, which the app has", () => {
    const root = createProject({
      "src/theme.css": `@import "tailwindcss";\n@import "tailwindcss/utilities.css";\n:root {\n  --gap: 1rem;\n}\n`,
    });

    expect(build(root, { themes: [style] }).get("style.json")).toMatchObject({
      cssVars: { light: { gap: "1rem" } },
    });
    expect(
      build(root, { themes: [style] }).get("style.json"),
    ).not.toHaveProperty("css");
  });

  it("refuses the at-rules of Tailwind CSS v3", () => {
    const root = createProject({
      "src/theme.css": `@tailwind base;\n@config "./tailwind.config.js";\n`,
    });

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      "src/theme.css:1 the shadcn CLI writes @tailwind into the app's stylesheet as it is, but @tailwind is a Tailwind CSS v3 directive and the app's stylesheet already imports Tailwind CSS v4; leave it out.",
      "src/theme.css:2 the shadcn CLI writes @config into the app's stylesheet as it is, where it would load a Tailwind CSS v3 JavaScript configuration the app does not have; write the theme in CSS with @theme inline, as Tailwind CSS v4 does.",
    ]);
  });

  it("refuses a library with Tailwind CSS before v4 installed", () => {
    const root = createProject({
      "node_modules/tailwindcss/package.json": JSON.stringify({
        name: "tailwindcss",
        version: "3.4.17",
      }),
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      "package.json has Tailwind CSS 3.4.17 installed; the build supports Tailwind CSS 4 or later only.",
    ]);
  });

  it("accepts Tailwind CSS 4 installed", () => {
    const root = createProject({
      "node_modules/tailwindcss/package.json": JSON.stringify({
        name: "tailwindcss",
        version: "4.3.3",
      }),
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
    });

    expect([...build(root).keys()]).toContain("badge.json");
  });
});
