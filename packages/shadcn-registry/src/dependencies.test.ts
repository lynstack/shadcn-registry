import { describe, expect, it } from "vitest";

import { build, createProject, problemsOf } from "#test/project.ts";

/** A project whose one item imports `code`, with `manifest` as its package.json. */
function projectImporting(
  code: string,
  manifest: Readonly<Record<string, unknown>>,
  extra: Readonly<Record<string, string>> = {},
): string {
  return createProject({
    "package.json": JSON.stringify({ name: "fixture", ...manifest }),
    "src/components/ui/badge/badge.tsx": code,
    ...extra,
  });
}

describe("npm dependencies", () => {
  it("lists each imported package once, with its range, by its package name", () => {
    const root = projectImporting(
      `import { Button } from "@base-ui/react/button";\nimport { Menu } from "@base-ui/react/menu";\nimport { clsx } from "clsx";\nexport const x = [Button, Menu, clsx];\n`,
      { dependencies: { "@base-ui/react": "^1.8.0", clsx: "2.1.1" } },
    );

    expect(build(root).get("badge.json")?.["dependencies"]).toStrictEqual([
      "@base-ui/react@^1.8.0",
      "clsx@2.1.1",
    ]);
  });

  it("leaves out peer dependencies and Node.js built-in modules, which the app has", () => {
    const root = projectImporting(
      `import { useState } from "react";\nimport path from "node:path";\nimport fs from "fs";\nexport const x = [useState, path, fs];\n`,
      { peerDependencies: { react: "^19.0.0" } },
    );

    expect(build(root).get("badge.json")).not.toHaveProperty("dependencies");
  });

  it("takes a type-only import of a development dependency as a development dependency", () => {
    const root = projectImporting(
      `import type { Options } from "tool";\nimport { type Other } from "kit";\nexport type X = Options | Other;\n`,
      { devDependencies: { kit: "^2.0.0", tool: "^1.0.0" } },
    );

    expect(build(root).get("badge.json")).toMatchObject({
      devDependencies: ["kit@^2.0.0", "tool@^1.0.0"],
    });
  });

  it("refuses a value import of a development dependency, and of an undeclared package", () => {
    const root = projectImporting(
      `import { a } from "tool";\nimport { b } from "missing";\nexport const x = [a, b];\n`,
      { devDependencies: { tool: "^1.0.0" } },
    );

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/badge/badge.tsx:1 imports "tool", a development dependency, at run time; move it to dependencies or peerDependencies.`,
      `src/components/ui/badge/badge.tsx:2 imports "missing", which package.json does not declare; add it to dependencies or peerDependencies.`,
    ]);
  });

  it("publishes a pnpm catalog range as the catalog's range", () => {
    const root = projectImporting(
      `import { a } from "alpha";\nimport { b } from "beta";\nexport const x = [a, b];\n`,
      { dependencies: { alpha: "catalog:", beta: "catalog:ui" } },
      {
        "pnpm-workspace.yaml": `catalog:\n  alpha: ^1.2.0\ncatalogs:\n  ui:\n    beta: ~3.0.0\n`,
      },
    );

    expect(build(root).get("badge.json")?.["dependencies"]).toStrictEqual([
      "alpha@^1.2.0",
      "beta@~3.0.0",
    ]);
  });

  it("publishes a workspace range as the linked package's version, as pnpm publish does", () => {
    const root = projectImporting(
      `import { a } from "@acme/a";\nimport { b } from "@acme/b";\nimport { c } from "@acme/c";\nexport const x = [a, b, c];\n`,
      {
        dependencies: {
          "@acme/a": "workspace:*",
          "@acme/b": "workspace:^",
          "@acme/c": "workspace:^2.0.0",
        },
      },
      {
        "node_modules/@acme/a/package.json": JSON.stringify({
          name: "@acme/a",
          version: "1.4.0",
        }),
        "node_modules/@acme/b/package.json": JSON.stringify({
          name: "@acme/b",
          version: "0.3.1",
        }),
        "node_modules/@acme/c/package.json": JSON.stringify({
          name: "@acme/c",
          version: "2.5.0",
        }),
      },
    );

    expect(build(root).get("badge.json")?.["dependencies"]).toStrictEqual([
      "@acme/a@1.4.0",
      "@acme/b@^0.3.1",
      "@acme/c@^2.0.0",
    ]);
  });

  it("refuses ranges an app cannot install from a registry", () => {
    const root = projectImporting(
      `import { a } from "alpha";\nimport { b } from "beta";\nimport { c } from "gamma";\nexport const x = [a, b, c];\n`,
      {
        dependencies: {
          alpha: "file:../alpha",
          beta: "catalog:missing",
          gamma: "workspace:*",
        },
      },
    );

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/badge/badge.tsx:1 "alpha" uses file:../alpha, which an app cannot install from a registry; publish it and use a version range.`,
      `src/components/ui/badge/badge.tsx:2 "beta" uses catalog:missing, which no catalog of pnpm-workspace.yaml defines.`,
      `src/components/ui/badge/badge.tsx:3 "gamma" uses workspace:*, but it is not linked in node_modules; run the install first.`,
    ]);
  });

  it("keeps an npm alias range as declared, and a dependency over a development dependency of the same name", () => {
    const root = projectImporting(
      `import { a } from "alpha";\nimport type { B } from "alpha";\nexport const x = a;\nexport type Y = B;\n`,
      {
        dependencies: { alpha: "npm:@scope/alpha@^2.0.0" },
        devDependencies: { alpha: "^1.0.0" },
      },
    );

    expect(build(root).get("badge.json")).toMatchObject({
      dependencies: ["alpha@npm:@scope/alpha@^2.0.0"],
    });
    expect(build(root).get("badge.json")).not.toHaveProperty("devDependencies");
  });

  it("takes export type … from a development dependency as a development dependency", () => {
    const root = projectImporting(`export type { Options } from "tool";\n`, {
      devDependencies: { tool: "^1.0.0" },
    });

    expect(build(root).get("badge.json")).toMatchObject({
      devDependencies: ["tool@^1.0.0"],
    });
  });
});
