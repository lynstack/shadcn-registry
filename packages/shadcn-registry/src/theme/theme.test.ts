import { describe, expect, it } from "vitest";
import path from "node:path";
import { writeFileSync } from "node:fs";

import { build, createProject, problemsOf } from "#test/project.ts";
import type { ThemeItem } from "#/config.ts";

const style: ThemeItem = {
  description: "The tokens.",
  extends: "none",
  name: "style",
  sources: ["src/theme/tokens.css", "src/theme/theme.css"],
  type: "registry:style",
};

const tokens = `:root {
  --background: oklch(1 0 0);
  --radius: 0.5rem;
}
.dark {
  --background: oklch(0.1 0 0);
}
@media (pointer: coarse) {
  :root {
    --target: 44px;
  }
}
`;

const theme = `@source "../components";
@custom-variant dark (&:is(.dark *));
@theme inline {
  --color-background: var(--background);
  --animate-spin: spin 1s linear infinite;
  --radius-lg: var(--radius);
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
}
@theme inline reference {
  --color-primary: var(--primary);
}
@theme reference inline {
  --color-secondary: var(--secondary);
}
@layer base {
  * {
    @apply border-border;
  }
  body {
    color: red !important;
  }
}
@utility focus-ring {
  outline: 2px solid;
}
`;

describe("themes", () => {
  it("splits the stylesheets into tokens, the theme map and CSS", () => {
    const root = createProject({
      "src/theme/theme.css": theme,
      "src/theme/tokens.css": tokens,
    });

    expect(build(root, { themes: [style] }).get("style.json")).toStrictEqual({
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      css: {
        "@custom-variant dark (&:is(.dark *))": {},
        "@keyframes spin": { to: { transform: "rotate(360deg)" } },
        "@layer base": {
          "*": { "@apply border-border": {} },
          body: { color: "red !important" },
        },
        "@media (pointer: coarse)": { ":root": { "--target": "44px" } },
        "@utility focus-ring": { outline: "2px solid" },
      },
      cssVars: {
        dark: { background: "oklch(0.1 0 0)" },
        light: { background: "oklch(1 0 0)", radius: "0.5rem" },
        theme: {
          "animate-spin": "spin 1s linear infinite",
          "color-background": "var(--background)",
          "radius-lg": "var(--radius)",
        },
      },
      description: "The tokens.",
      extends: "none",
      name: "style",
      title: "Style",
      type: "registry:style",
    });
  });

  it("lists a theme first in registry.json", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
      "src/theme/theme.css": theme,
      "src/theme/tokens.css": tokens,
    });
    expect(build(root, { themes: [style] }).get("registry.json")).toMatchObject(
      { items: [{ name: "style" }, { name: "badge" }] },
    );
  });

  it("refuses what the shadcn CLI cannot write back as it was", () => {
    const root = createProject({
      "src/theme/theme.css": `@theme {\n  --color-x: red;\n}\n@theme inline {\n  color: red;\n}\n@media print {\n  color: red;\n}\ncolor: blue;\n@theme static {\n  --color-x: red;\n}\n@theme reference {\n  --color-x: red;\n}\n`,
      "src/theme/tokens.css": `:root {\n  --a: 1;\n  color: red;\n}\n.dark {\n  --a: 2;\n}\n.dark {\n  --a: 3;\n}\n`,
    });

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      `src/theme/theme.css:1 the shadcn CLI writes every theme variable into the app's @theme inline, where "@theme" would change meaning: Tailwind CSS would emit its variables or inline their values. Put each value in :root (and .dark), and map it in @theme inline.`,
      `src/theme/theme.css:5 @theme inline may hold only custom properties and keyframes: the shadcn CLI writes each theme variable into the app's @theme inline as "--name: value", and moves only @keyframes there; put other styles in a rule of their own.`,
      "src/theme/theme.css:8 the shadcn CLI writes a declaration only inside a rule or @utility.",
      "src/theme/theme.css:10 the shadcn CLI writes each top-level key of css as a rule, so a declaration outside one would reach the app as a selector; put it inside a rule.",
      `src/theme/theme.css:11 the shadcn CLI writes every theme variable into the app's @theme inline, where "@theme static" would change meaning: Tailwind CSS would emit its variables or inline their values. Put each value in :root (and .dark), and map it in @theme inline.`,
      `src/theme/theme.css:14 the shadcn CLI writes every theme variable into the app's @theme inline, where "@theme reference" would change meaning: Tailwind CSS would emit its variables or inline their values. Put each value in :root (and .dark), and map it in @theme inline.`,
      `src/theme/tokens.css:3 the light tokens may hold only custom properties: the shadcn CLI writes each one into the app's :root as "--name: value"; put other styles in a rule of their own.`,
      `src/theme/tokens.css:9 "a" is given two values for dark; the registry keeps one value per key, as the shadcn CLI keeps one when it writes a token the app already has, so keep one.`,
    ]);
  });

  it("refuses nested blocks, which the CLI flattens, and a declaration written twice in a block", () => {
    const root = createProject({
      "src/theme/theme.css": `.btn {\n  color: red;\n  .icon {\n    color: blue;\n  }\n  @media print {\n    color: black;\n  }\n  @apply px-2;\n  height: 100vh;\n  height: 100dvh;\n}\n`,
      "src/theme/tokens.css": ":root {}\n",
    });

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      "src/theme/theme.css:3 the shadcn CLI flattens a block nested in a rule into another selector; write it as a rule of its own.",
      "src/theme/theme.css:6 the shadcn CLI flattens a block nested in a rule into another selector; write it as a rule of its own.",
      `src/theme/theme.css:11 "height" is written twice in one block; the registry keeps one value per key, as the shadcn CLI keeps one when it writes a declaration the app's rule already has, so keep one.`,
    ]);
  });

  it("merges a rule or at-rule two stylesheets write, as the CLI merges it into the app", () => {
    const root = createProject({
      "src/theme/theme.css":
        "@layer base {\n  body {\n    margin: 0;\n  }\n}\n",
      "src/theme/tokens.css":
        ":root {\n  --gap:  1 ;\n  --size: 2 !important;\n}\n@layer base {\n  * {\n    outline: none;\n  }\n}\n",
    });

    expect(build(root, { themes: [style] }).get("style.json")).toMatchObject({
      css: {
        "@layer base": { "*": { outline: "none" }, body: { margin: "0" } },
      },
      cssVars: { light: { gap: "1", size: "2 !important" } },
    });
  });

  it("reads a stylesheet with CRLF line endings as one with LF", () => {
    const root = createProject({
      "src/theme/theme.css":
        "@layer base {\r\n  body {\r\n    margin: 0;\r\n  }\r\n}\r\n",
      "src/theme/tokens.css": ":root {\r\n  --font: a,\r\n    b;\r\n}\r\n",
    });

    expect(build(root, { themes: [style] }).get("style.json")).toMatchObject({
      cssVars: { light: { font: "a,\n    b" } },
    });
  });

  it("reports a stylesheet that is missing or cannot be parsed", () => {
    const root = createProject({
      "src/theme/theme.css": ".btn {\n  color: red;\n",
    });

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      "src/theme/theme.css:1 cannot be parsed: Unclosed block.",
      "src/theme/tokens.css does not exist.",
    ]);
  });
});

describe("theme sources", () => {
  it("reports a source that is a folder or not UTF-8 text", () => {
    const root = createProject({ "src/theme/tokens.css/a.css": ":root {}\n" });
    writeFileSync(path.join(root, "src/theme/theme.css"), Buffer.from([255]));

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      "src/theme/theme.css is not UTF-8 text, and a registry carries text only.",
      "src/theme/tokens.css is a folder; name the files in it.",
    ]);
  });
});
