import { describe, expect, it } from "vitest";

import { build, createProject, problemsOf } from "#test/project.ts";
import type { ItemRule } from "./config.ts";

const badge = {
  "src/components/ui/badge/badge.tsx": `import { useState } from "react";\nimport { motion } from "motion";\nexport const badge = [useState, motion];\n`,
};

function withPeers(): string {
  return createProject({
    ...badge,
    "package.json": JSON.stringify({
      name: "fixture",
      peerDependencies: { motion: "^12.0.0", react: "^19.0.0" },
    }),
  });
}

describe("configuration", () => {
  it("lists a peer that installPeers names as a dependency with its peer range", () => {
    expect(
      build(withPeers(), { installPeers: ["motion"] }).get("badge.json"),
    ).toMatchObject({
      dependencies: ["motion@^12.0.0"],
    });
  });

  it("leaves every other peer out", () => {
    expect(build(withPeers()).get("badge.json")).not.toHaveProperty(
      "dependencies",
    );
  });

  it("refuses installPeers naming a package that is no peer", () => {
    expect(problemsOf(withPeers(), { installPeers: ["clsx"] })).toStrictEqual([
      ` installPeers names "clsx", which package.json does not list in peerDependencies.`,
    ]);
  });

  it("refuses a namespace and a URL the shadcn CLI cannot use", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
    });

    expect(
      problemsOf(root, {
        namespace: "acme",
        url: "https://acme.dev/r/item.json",
      }),
    ).toStrictEqual([
      ` The namespace "acme" must be @ and lowercase letters, digits and single hyphens, as the shadcn CLI names a registry.`,
      ` The url "https://acme.dev/r/item.json" must be an http or https URL with {name} where the item's name goes.`,
    ]);
  });

  it.each<readonly [string, ItemRule["type"]]>([
    ["@ui", "registry:ui"],
    ["@components/forms", "registry:component"],
    ["@lib", "registry:lib"],
    ["@hooks", "registry:hook"],
    ["~/src/blocks", "registry:block"],
    ["app/dashboard", "registry:page"],
    ["config", "registry:file"],
  ])("accepts the target %s for %s", (target, type) => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
    });

    expect([
      ...build(root, {
        items: [{ source: "src/components/ui/{item}", target, type }],
      }).keys(),
    ]).toContain("badge.json");
  });

  it.each<readonly [string, ItemRule["type"], string]>([
    ["@utils", "registry:lib", ""],
    ["components/ui", "registry:ui", ""],
    ["@app/page", "registry:page", ", or be a path from the app's root"],
  ])("refuses the target %s for %s", (target, type, hint) => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
    });

    expect(
      problemsOf(root, {
        items: [{ source: "src/components/ui/{item}", target, type }],
      }),
    ).toStrictEqual([
      ` The target "${target}" of "src/components/ui/{item}" must start with @ui, @components, @lib, @hooks or ~/${hint}; the shadcn CLI knows no other alias.`,
    ]);
  });
});
