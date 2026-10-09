import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { BuiltRegistry } from "./registry.ts";

/** How the output folder differs from a build. */
interface OutputDifference {
  /** Files the build writes that the folder lacks or holds otherwise. */
  readonly changed: readonly string[];
  /** JSON files in the folder that the build does not write. */
  readonly stale: readonly string[];
}

function jsonFilesIn(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function readIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** Compares the output folder with a build, without writing. */
function compareOutput(registry: BuiltRegistry): OutputDifference {
  const changed = [...registry.files]
    .filter(
      ([name, text]) =>
        readIfPresent(path.join(registry.outDir, name)) !== text,
    )
    .map(([name]) => name);
  const stale = jsonFilesIn(registry.outDir).filter(
    (name) => !registry.files.has(name),
  );
  return { changed, stale };
}

/**
 * Writes a build into its output folder: each changed file, and deletes
 * every other JSON file in the folder.
 */
function writeOutput(registry: BuiltRegistry): OutputDifference {
  const difference = compareOutput(registry);
  mkdirSync(registry.outDir, { recursive: true });
  for (const name of difference.changed) {
    writeFileSync(
      path.join(registry.outDir, name),
      registry.files.get(name) ?? "",
    );
  }
  for (const name of difference.stale) {
    rmSync(path.join(registry.outDir, name));
  }
  return difference;
}

export { compareOutput, writeOutput };
export type { OutputDifference };
