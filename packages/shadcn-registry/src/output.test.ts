import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { baseConfig, createProject } from "#test/project.ts";
import { compareOutput, writeOutput } from "./output.ts";
import type { BuiltRegistry } from "./registry.ts";
import type { Config } from "./config.ts";
import { buildRegistry } from "./registry.ts";

const files = {
  "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
};

/** Builds a library in `lib` into `site/r`, which holds a stale file. */
function buildOutsideRoot(config: Partial<Config>): {
  registry: BuiltRegistry;
  workspace: string;
} {
  const workspace = createProject({
    "lib/package.json": JSON.stringify({ name: "lib", type: "module" }),
    "lib/src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
    "lib/tsconfig.json": "{}",
    "site/r/old.json": "{}\n",
  });
  const registry = buildRegistry(
    { ...baseConfig, ...config, outDir: "../site/r" },
    path.join(workspace, "lib"),
  );
  return { registry, workspace };
}

describe("output", () => {
  it("writes each file, then finds nothing to change", () => {
    const root = createProject(files);
    const registry = buildRegistry(baseConfig, root);

    expect(writeOutput(registry)).toStrictEqual({
      changed: ["badge.json", "registry.json"],
      stale: [],
    });
    expect(readFileSync(path.join(root, "public/r/badge.json"), "utf8")).toBe(
      registry.files.get("badge.json"),
    );
    expect(compareOutput(registry)).toStrictEqual({ changed: [], stale: [] });
  });

  it("finds a changed file and the file of an item that is gone, and deletes the latter", () => {
    const root = createProject(files);
    const registry = buildRegistry({ ...baseConfig, outDir: "dist/r" }, root);
    writeOutput(registry);
    writeFileSync(path.join(root, "dist/r/badge.json"), "{}\n");
    writeFileSync(path.join(root, "dist/r/old.json"), "{}\n");
    writeFileSync(path.join(root, "dist/r/notes.txt"), "kept\n");

    expect(compareOutput(registry)).toStrictEqual({
      changed: ["badge.json"],
      stale: ["old.json"],
    });

    writeOutput(registry);

    expect(readdirSync(path.join(root, "dist/r")).toSorted()).toStrictEqual([
      "badge.json",
      "notes.txt",
      "registry.json",
    ]);
  });

  it("deletes the stale files of an outDir outside the root", () => {
    const { registry, workspace } = buildOutsideRoot({});

    expect(compareOutput(registry).stale).toStrictEqual(["old.json"]);

    writeOutput(registry);

    expect(
      readdirSync(path.join(workspace, "site/r")).toSorted(),
    ).toStrictEqual(["badge.json", "registry.json"]);
  });

  it("keeps the stale files when emptyOutDir is false", () => {
    const { registry, workspace } = buildOutsideRoot({ emptyOutDir: false });

    expect(compareOutput(registry).stale).toStrictEqual([]);

    writeOutput(registry);

    expect(
      readdirSync(path.join(workspace, "site/r")).toSorted(),
    ).toStrictEqual(["badge.json", "old.json", "registry.json"]);
  });

  it("builds the same text every time", () => {
    const root = createProject(files);

    expect(buildRegistry(baseConfig, root).files).toStrictEqual(
      buildRegistry(baseConfig, root).files,
    );
  });
});
