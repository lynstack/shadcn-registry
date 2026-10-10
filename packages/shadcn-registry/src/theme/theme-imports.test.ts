import { describe, expect, it } from "vitest";

import { build, createProject, problemsOf } from "#test/project.ts";
import type { ThemeItem } from "#/config.ts";

const style: ThemeItem = {
  extends: "none",
  name: "style",
  sources: ["src/theme/tokens.css", "src/theme/theme.css"],
  type: "registry:style",
};

describe("theme imports", () => {
  it("takes a package @import as a dependency, and refuses a relative one", () => {
    const files = {
      "package.json": JSON.stringify({
        dependencies: { "tw-animate-css": "^1.4.0" },
        name: "fixture",
      }),
      "src/theme/tokens.css": ":root {}\n",
    };

    expect(
      build(
        createProject({
          ...files,
          "src/theme/theme.css": `@import "tw-animate-css";\n`,
        }),
        { themes: [style] },
      ).get("style.json"),
    ).toMatchObject({
      css: { '@import "tw-animate-css"': {} },
      dependencies: ["tw-animate-css@^1.4.0"],
    });
    expect(
      problemsOf(
        createProject({
          ...files,
          "src/theme/theme.css": `@import "./more.css";\n`,
        }),
        { themes: [style] },
      ),
    ).toStrictEqual([
      `src/theme/theme.css:1 the shadcn CLI writes @import "./more.css" as it is, where it names a file the app does not have; list the stylesheet among the theme's sources instead of importing it.`,
    ]);
  });
});

describe("theme plugins", () => {
  const files = {
    "package.json": JSON.stringify({
      dependencies: { "@tailwindcss/typography": "^0.5.19" },
      name: "fixture",
    }),
    "src/theme/tokens.css": ":root {}\n",
  };

  it("takes a package @plugin as a dependency", () => {
    const root = createProject({
      ...files,
      "src/theme/theme.css": `@plugin "@tailwindcss/typography";\n`,
    });

    expect(build(root, { themes: [style] }).get("style.json")).toMatchObject({
      css: { '@plugin "@tailwindcss/typography"': {} },
      dependencies: ["@tailwindcss/typography@^0.5.19"],
    });
  });

  it("refuses a relative @plugin, one with options, and one package.json lacks", () => {
    const root = createProject({
      ...files,
      "src/theme/theme.css": `@plugin "./plugin.js";\n@plugin "@tailwindcss/typography" {\n  className: prose;\n}\n@plugin "daisyui";\n`,
    });

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      `src/theme/theme.css:1 the shadcn CLI writes @plugin "./plugin.js" as it is, where it names a file the app does not have; load the plugin from a package.`,
      `src/theme/theme.css:2 the shadcn CLI writes @plugin "@tailwindcss/typography" without the options of its block, so the app would load it with its defaults; leave the options out.`,
      `src/theme/theme.css:5 imports "daisyui", which package.json does not declare; add it to dependencies or peerDependencies.`,
    ]);
  });

  it("accepts a @plugin whose block holds only comments", () => {
    const root = createProject({
      "package.json": JSON.stringify({
        dependencies: { "@tailwindcss/typography": "^0.5.19" },
        name: "fixture",
      }),
      "src/theme/theme.css": `@plugin "@tailwindcss/typography" {\n  /* defaults */\n}\n`,
      "src/theme/tokens.css": ":root {}\n",
    });

    expect(build(root, { themes: [style] }).get("style.json")).toMatchObject({
      dependencies: ["@tailwindcss/typography@^0.5.19"],
    });
  });
});

describe("stylesheets on the web", () => {
  it("keeps an @import of a stylesheet on the web, which needs no dependency", () => {
    const fonts =
      "url(https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap)";
    const root = createProject({
      "src/theme/theme.css": `@import ${fonts};\n@import "//cdn.example.com/a.css";\n`,
      "src/theme/tokens.css": ":root {}\n",
    });
    const item = build(root, { themes: [style] }).get("style.json");

    expect(item).toMatchObject({
      css: {
        '@import "//cdn.example.com/a.css"': {},
        [`@import ${fonts}`]: {},
      },
    });
    expect(item).not.toHaveProperty("dependencies");
  });

  it("refuses a @plugin from the web and an @import from the app's root", () => {
    const root = createProject({
      "src/theme/theme.css": `@plugin "https://example.com/plugin.js";\n@import "/a.css";\n`,
      "src/theme/tokens.css": ":root {}\n",
    });

    expect(problemsOf(root, { themes: [style] })).toStrictEqual([
      `src/theme/theme.css:1 the shadcn CLI writes @plugin "https://example.com/plugin.js" as it is, where it names a file the app does not have; load the plugin from a package.`,
      `src/theme/theme.css:2 the shadcn CLI writes @import "/a.css" as it is, where it names a file the app does not have; list the stylesheet among the theme's sources instead of importing it.`,
    ]);
  });
});
