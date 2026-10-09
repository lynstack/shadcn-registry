import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { baseConfig, createProject } from "#test/project.ts";
import { compareOutput, writeOutput } from "./output.ts";
import { buildRegistry } from "./registry.ts";

const files = {
  "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
};

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

  it("builds the same text every time", () => {
    const root = createProject(files);

    expect(buildRegistry(baseConfig, root).files).toStrictEqual(
      buildRegistry(baseConfig, root).files,
    );
  });
});
