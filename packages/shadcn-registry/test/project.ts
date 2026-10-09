import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Config } from "#/config.ts";
import { RegistryError } from "#/registry-error.ts";
import { buildRegistry } from "#/registry.ts";

/** The tsconfig most projects use: `@/` and `#/` for `src`. */
const defaultTsconfig = JSON.stringify({
  compilerOptions: {
    module: "preserve",
    paths: { "#/*": ["./src/*"], "@/*": ["./src/*"] },
  },
});

const defaultManifest = {
  dependencies: { "class-variance-authority": "^0.7.1" },
  name: "fixture",
  peerDependencies: { react: "^19.0.0" },
  type: "module",
};

/**
 * Writes a project into a new temporary folder and returns its root.
 * `package.json` and `tsconfig.json` default to the ones above.
 */
function createProject(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "shadcn-registry-"));
  const all = {
    "package.json": JSON.stringify(defaultManifest),
    "tsconfig.json": defaultTsconfig,
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    const absolute = path.join(root, ...file.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return root;
}

/** The base of a configuration: rules for `src/components/ui/{item}` and `src/lib/{item}.ts`. */
const baseConfig: Config = {
  homepage: "https://example.com",
  items: [
    { source: "src/components/ui/{item}", target: "@ui", type: "registry:ui" },
    { source: "src/lib/{item}.ts", target: "@lib", type: "registry:lib" },
  ],
  name: "acme",
};

function parseObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("The build wrote JSON that holds no object.");
  }
  return Object.fromEntries(Object.entries(value));
}

/** Builds a project and parses each output file. */
function build(
  root: string,
  config: Partial<Config> = {},
): ReadonlyMap<string, Record<string, unknown>> {
  const registry = buildRegistry({ ...baseConfig, ...config }, root);
  return new Map(
    [...registry.files].map(([name, text]) => [name, parseObject(text)]),
  );
}

/** The problem messages of a build that fails, each with its place. */
function problemsOf(root: string, config: Partial<Config> = {}): string[] {
  try {
    buildRegistry({ ...baseConfig, ...config }, root);
  } catch (error) {
    if (error instanceof RegistryError) {
      return error.problems.map(
        (problem) =>
          `${problem.file ?? ""}${problem.line === undefined ? "" : `:${String(problem.line)}`} ${problem.message}`,
      );
    }
    throw error;
  }
  throw new Error("The build succeeded.");
}

export { baseConfig, build, createProject, problemsOf };
