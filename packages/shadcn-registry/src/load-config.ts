import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Config } from "./config.ts";

/** The configuration files a root may hold, in the order they are looked for. */
const configNames: readonly string[] = [
  "shadcn-registry.config.ts",
  "shadcn-registry.config.mts",
  "shadcn-registry.config.js",
  "shadcn-registry.config.mjs",
];

/** A configuration, with the folder its paths start from. */
interface LoadedConfig {
  /** The configuration, the file's default export. */
  readonly config: Config;
  /** The folder of the configuration file. */
  readonly root: string;
  /** The configuration file, absolute. */
  readonly file: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/**
 * Loads the default export of a configuration file. Node.js strips the
 * types of a TypeScript file itself, so the file uses only erasable
 * syntax and imports with extensions. Throws when no file is found, or
 * when its default export lacks `name`, `homepage` or `items`.
 *
 * @param cwd - The folder `file` starts from, and where one is looked for.
 * @param file - The file, or `undefined` for the first of
 *   `shadcn-registry.config.{ts,mts,js,mjs}` in `cwd`.
 */
async function loadConfig(
  cwd: string,
  file: string | undefined,
): Promise<LoadedConfig> {
  const found =
    file === undefined
      ? configNames
          .map((name) => path.resolve(cwd, name))
          .find((candidate) => existsSync(candidate))
      : path.resolve(cwd, file);
  if (found === undefined) {
    throw new Error(
      `No configuration found in ${cwd}; create ${configNames[0] ?? ""}.`,
    );
  }
  const loaded: unknown = await import(pathToFileURL(found).href);
  const config = isRecord(loaded) ? loaded["default"] : undefined;
  assertConfig(config, found);
  return { config, file: found, root: path.dirname(found) };
}

/**
 * Checks the fields a build cannot start without. A JavaScript
 * configuration has no types, and a TypeScript one is only stripped.
 */
function assertConfig(value: unknown, file: string): asserts value is Config {
  if (!isRecord(value)) {
    throw new TypeError(
      `${file} must export its configuration as the default export.`,
    );
  }
  const missing = [
    typeof value["name"] === "string" ? [] : ["name (a string)"],
    typeof value["homepage"] === "string" ? [] : ["homepage (a string)"],
    Array.isArray(value["items"]) ? [] : ["items (an array of rules)"],
  ].flat();
  if (missing.length > 0) {
    throw new TypeError(
      `${file}: the configuration needs ${missing.join(", ")}.`,
    );
  }
}

export { loadConfig };
export type { LoadedConfig };
