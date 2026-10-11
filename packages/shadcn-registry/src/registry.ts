import path from "node:path";
import { readFileSync } from "node:fs";

import type { Build } from "./items.ts";
import type { Config } from "./config.ts";
import { Problems } from "./problems.ts";
import { createDependencyReader } from "./dependencies.ts";
import { itemsOf } from "./items.ts";
import { outputFolderOf } from "./output.ts";
import { registryFiles } from "./registry-json.ts";

/** A built registry: each file the output folder holds, by name. */
interface BuiltRegistry {
  /** The output folder, absolute. */
  readonly outDir: string;
  /**
   * Whether a write deletes the JSON files of the output folder that the
   * build does not write: `emptyOutDir`, `true` by default.
   */
  readonly emptyOutDir: boolean;
  /** `registry.json` and `<item>.json`, each as the JSON text to write. */
  readonly files: ReadonlyMap<string, string>;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Why a file cannot be read as text, by the code of the error. */
const unreadableReasons: ReadonlyMap<unknown, string> = new Map([
  ["EISDIR", "is a folder; name the files in it."],
  ["ENOENT", "does not exist."],
  [
    "ERR_ENCODING_INVALID_ENCODED_DATA",
    "is not UTF-8 text, and a registry carries text only.",
  ],
]);

/** Why a file cannot be read as text, or `undefined` for another error. */
function unreadableReason(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? unreadableReasons.get(error.code)
    : undefined;
}

/**
 * A file's text, with line endings as `\n` so that a checkout with CRLF
 * builds the same registry. A file that is missing or not UTF-8 is a
 * problem: an item's `content` carries text only.
 */
function readText(root: string, file: string, problems: Problems): string {
  try {
    return utf8
      .decode(readFileSync(path.join(root, file)))
      .replaceAll("\r\n", "\n");
  } catch (error) {
    const reason = unreadableReason(error);
    if (reason === undefined) {
      throw error;
    }
    problems.add({ file, message: reason });
    return "";
  }
}

/**
 * Builds the registry of a root: finds its items, follows the imports of
 * every file, and reads its themes. Throws a {@link RegistryError} that
 * lists every problem found, so the registry is either whole or not built.
 * Throws a `TypeError` when `package.json` holds no object, or one of its
 * dependency fields does not map names to ranges.
 *
 * @param config - The registry's configuration.
 * @param root - The folder its paths start from: the package's own.
 */
function buildRegistry(config: Config, root: string): BuiltRegistry {
  const texts = new Map<string, string>();
  const build: Build = {
    config,
    dependencies: createDependencyReader(root, config.installPeers),
    problems: new Problems(),
    root,
    textOf: (file) => {
      const text = texts.get(file) ?? readText(root, file, build.problems);
      texts.set(file, text);
      return text;
    },
  };
  const files = registryFiles(config, itemsOf(build), build);
  build.problems.throwIfAny();
  return { files, ...outputFolderOf(config, root) };
}

export { buildRegistry };
export type { BuiltRegistry };
