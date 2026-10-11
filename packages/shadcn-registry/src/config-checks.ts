import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Config } from "./config.ts";
import type { DependencyReader } from "./dependencies.ts";
import type { Problems } from "./problems.ts";

/** The first major version of Tailwind CSS the build supports. */
const minimumTailwindMajor = 4;

/** Item names the shadcn CLI writes as one file name each. */
const itemNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Each name once, in the shape the CLI names item files by. */
function checkItemNames(names: readonly string[], problems: Problems): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      problems.add({
        message: `Two items are named "${name}"; the shadcn CLI finds an item by its name, so rename one.`,
      });
    }
    if (!itemNamePattern.test(name)) {
      problems.add({
        message: `"${name}" cannot name an item: use lowercase letters, digits and single hyphens.`,
      });
    }
    seen.add(name);
  }
}

/**
 * Refuses a library that has Tailwind CSS before v4 installed: its theme
 * would be written for a version the build does not support.
 */
function checkTailwindVersion(root: string, problems: Problems): void {
  const file = path.join(root, "node_modules", "tailwindcss", "package.json");
  if (!existsSync(file)) {
    return;
  }
  const manifest: unknown = JSON.parse(readFileSync(file, "utf8"));
  const version: unknown =
    typeof manifest === "object" && manifest !== null
      ? Reflect.get(manifest, "version")
      : undefined;
  const major = Math.trunc(Number(String(version).split(".")[0]));
  if (!(major >= minimumTailwindMajor)) {
    problems.add({
      file: "package.json",
      message: `has Tailwind CSS ${String(version)} installed; the build supports Tailwind CSS ${String(minimumTailwindMajor)} or later only.`,
    });
  }
}

/**
 * Checks what the configuration's schema cannot, as it needs the
 * project: that each peer it installs is a peer.
 */
function checkConfig(
  config: Config,
  dependencies: DependencyReader,
  problems: Problems,
): void {
  for (const peer of config.installPeers ?? []) {
    if (!dependencies.peers.has(peer)) {
      problems.add({
        message: `installPeers names "${peer}", which package.json does not list in peerDependencies.`,
      });
    }
  }
}

export { checkConfig, checkItemNames, checkTailwindVersion };
