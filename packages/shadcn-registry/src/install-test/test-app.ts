import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import path from "node:path";

import {
  installedVersion,
  isRecord,
  readJson,
  readWorkspace,
} from "#/project-files.ts";

/** What the packages of a test app are completed from. */
interface TestApp {
  /** The library's folder, whose installed packages give the app its versions. */
  readonly root: string;
  /** The app that `shadcn init --template` wrote. */
  readonly appDir: string;
  /** More packages for the app, by name and range. */
  readonly extra: Readonly<Record<string, string>>;
}

/** The settings of the library's pnpm workspace an install needs: its build and release-age policy. */
const workspacePolicy: ReadonlySet<string> = new Set([
  "allowBuilds",
  "minimumReleaseAge",
  "minimumReleaseAgeExclude",
  "onlyBuiltDependencies",
]);

/** The pnpm workspace settings above the library that the app's installs need. */
function policyOf(root: string): Record<string, unknown> {
  const workspace = readWorkspace(root);
  return isRecord(workspace)
    ? Object.fromEntries(
        Object.entries(workspace).filter(([key]) => workspacePolicy.has(key)),
      )
    : {};
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** A setting of the app's workspace with the library's added: lists joined, maps merged, the library's value otherwise. */
function mergedSetting(app: unknown, library: unknown): unknown {
  if (isList(app) && isList(library)) {
    return [...new Set([...app, ...library])];
  }
  return isRecord(app) && isRecord(library) ? { ...app, ...library } : library;
}

/**
 * Adds the library's pnpm build and release-age policy to the
 * `pnpm-workspace.yaml` of the app, which its template may already
 * have, so that every package an item brings installs as it does for
 * the library. It does so only for an app that pnpm installed, as its
 * `pnpm-lock.yaml` shows: the shadcn CLI takes a `pnpm-workspace.yaml`
 * as the sign of pnpm before a `yarn.lock` or `package-lock.json`, and
 * would install the items of an npm or Yarn app with pnpm.
 */
function writeWorkspacePolicy(app: TestApp): void {
  const policy = Object.entries(policyOf(app.root));
  if (
    policy.length === 0 ||
    !existsSync(path.join(app.appDir, "pnpm-lock.yaml"))
  ) {
    return;
  }
  const file = path.join(app.appDir, "pnpm-workspace.yaml");
  const parsed: unknown = existsSync(file)
    ? parseYaml(readFileSync(file, "utf8"))
    : undefined;
  const workspace: Record<string, unknown> = isRecord(parsed)
    ? { ...parsed }
    : {};
  for (const [key, value] of policy) {
    workspace[key] = mergedSetting(workspace[key], value);
  }
  writeFileSync(file, stringifyYaml(workspace));
}

/** The library's peer dependencies by name and range. */
function peersOf(root: string): Record<string, string> {
  const manifest = readJson(path.join(root, "package.json"));
  const peers = isRecord(manifest) ? manifest["peerDependencies"] : undefined;
  return isRecord(peers)
    ? Object.fromEntries(
        Object.entries(peers).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}

/** The packages the app's package.json lists, in any of its dependency fields. */
function packagesOf(appDir: string): Set<string> {
  const manifest = readJson(path.join(appDir, "package.json"));
  return new Set(
    [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ].flatMap((field) => {
      const packages = isRecord(manifest) ? manifest[field] : undefined;
      return isRecord(packages) ? Object.keys(packages) : [];
    }),
  );
}

/**
 * The packages to add to the app, as `name@range`: the library's peer
 * dependencies its template lacks, at the versions the library has
 * installed, as a user installs them for the library, then `extra`.
 */
function packagesToAdd(app: TestApp): string[] {
  const present = packagesOf(app.appDir);
  const packages: Record<string, string> = {};
  for (const [name, range] of Object.entries(peersOf(app.root))) {
    if (!present.has(name)) {
      packages[name] = installedVersion(app.root, name) ?? range;
    }
  }
  Object.assign(packages, app.extra);
  return Object.entries(packages).map(([name, range]) => `${name}@${range}`);
}

/** The stylesheet the shadcn CLI writes the themes into, from the app's components.json. */
function stylesheetOf(appDir: string): string {
  const config = readJson(path.join(appDir, "components.json"));
  const tailwind = isRecord(config) ? config["tailwind"] : undefined;
  const css = isRecord(tailwind) ? tailwind["css"] : undefined;
  if (typeof css !== "string" || css === "") {
    throw new TypeError("The app's components.json names no stylesheet.");
  }
  return path.join(appDir, css);
}

export { packagesToAdd, stylesheetOf, writeWorkspacePolicy };
export type { TestApp };
