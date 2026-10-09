import path from "node:path";

import {
  installedVersion,
  isRecord,
  readJson,
  readWorkspace,
} from "./project-files.ts";

/** The dependency fields of the root's package.json. */
interface Manifest {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
}

/** How an item depends on a package it imports. */
type Dependency =
  | { readonly kind: "dependency"; readonly spec: string }
  | { readonly kind: "devDependency"; readonly spec: string }
  | { readonly kind: "peer" }
  | { readonly kind: "problem"; readonly message: string };

/** Turns the packages an item imports into the ranges the shadcn CLI installs. */
interface DependencyReader {
  readonly dependencyOf: (name: string, typeOnly: boolean) => Dependency;
  /** The names of the root's peer dependencies. */
  readonly peers: ReadonlySet<string>;
}

function isStringRecord(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function stringRecord(
  value: unknown,
  field: string,
): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {};
  }
  if (!isStringRecord(value)) {
    throw new TypeError(`package.json: ${field} must map names to ranges.`);
  }
  return value;
}

function readManifest(root: string): Manifest {
  const manifest = readJson(path.join(root, "package.json"));
  if (!isRecord(manifest)) {
    throw new TypeError("package.json must hold an object.");
  }
  return {
    dependencies: stringRecord(manifest["dependencies"], "dependencies"),
    devDependencies: stringRecord(
      manifest["devDependencies"],
      "devDependencies",
    ),
    peerDependencies: stringRecord(
      manifest["peerDependencies"],
      "peerDependencies",
    ),
  };
}

/** The range a pnpm catalog gives a package, as `pnpm publish` writes it. */
function catalogRange(
  workspace: unknown,
  catalog: string,
  name: string,
): string | undefined {
  if (!isRecord(workspace)) {
    return undefined;
  }
  const catalogs = isRecord(workspace["catalogs"]) ? workspace["catalogs"] : {};
  const entries =
    catalog === "" || catalog === "default"
      ? (workspace["catalog"] ?? catalogs["default"])
      : catalogs[catalog];
  const range = isRecord(entries) ? entries[name] : undefined;
  return typeof range === "string" ? range : undefined;
}

/** What the ranges of `catalog:` and `workspace:` are read from. */
interface RangeSources {
  readonly root: string;
  /** The parsed pnpm-workspace.yaml. */
  readonly workspace: unknown;
}

/** A published range, or why there is none. */
type Published = { readonly range: string } | { readonly message: string };

/** One package as package.json declares it. */
interface Declared {
  readonly name: string;
  readonly range: string;
}

function workspaceRange(sources: RangeSources, declared: Declared): Published {
  const wanted = declared.range.slice("workspace:".length);
  const version = installedVersion(sources.root, declared.name);
  if (version === undefined) {
    return {
      message: `"${declared.name}" uses ${declared.range}, but it is not linked in node_modules; run the install first.`,
    };
  }
  if (wanted === "*") {
    return { range: version };
  }
  return {
    range: wanted === "^" || wanted === "~" ? `${wanted}${version}` : wanted,
  };
}

/**
 * The range to publish for one declared range. `catalog:` takes the
 * catalog's range and `workspace:` the linked package's version, as
 * `pnpm publish` does; other protocols point at files or repositories an
 * app cannot install from the registry.
 */
function publishedRange(sources: RangeSources, declared: Declared): Published {
  const { name, range } = declared;
  if (range.startsWith("catalog:")) {
    const found = catalogRange(
      sources.workspace,
      range.slice("catalog:".length),
      name,
    );
    return found === undefined
      ? {
          message: `"${name}" uses ${range}, which no catalog of pnpm-workspace.yaml defines.`,
        }
      : publishedRange(sources, { name, range: found });
  }
  if (range.startsWith("workspace:")) {
    return workspaceRange(sources, declared);
  }
  if (/^(?:file|link|git|git\+[a-z]+|github|http|https|portal):/u.test(range)) {
    return {
      message: `"${name}" uses ${range}, which an app cannot install from a registry; publish it and use a version range.`,
    };
  }
  return { range };
}

/**
 * Reads the root's package.json. A value import needs a dependency, or a
 * peer dependency, which the app already has unless `installPeers` names
 * it; a type-only import may also use a development dependency, which the
 * item lists as one.
 */
function createDependencyReader(
  root: string,
  installPeers: readonly string[] = [],
): DependencyReader {
  const installed = new Set(installPeers);
  const manifest = readManifest(root);
  const sources = { root, workspace: readWorkspace(root) };
  const toSpec = (
    kind: "dependency" | "devDependency",
    name: string,
    range: string,
  ): Dependency => {
    const published = publishedRange(sources, { name, range });
    return "message" in published
      ? { kind: "problem", message: published.message }
      : { kind, spec: `${name}@${published.range}` };
  };
  return {
    dependencyOf: (name, typeOnly) => {
      const range = manifest.dependencies[name];
      if (range !== undefined) {
        return toSpec("dependency", name, range);
      }
      const peerRange = manifest.peerDependencies[name];
      if (peerRange !== undefined) {
        return installed.has(name)
          ? toSpec("dependency", name, peerRange)
          : { kind: "peer" };
      }
      const devRange = manifest.devDependencies[name];
      if (typeOnly && devRange !== undefined) {
        return toSpec("devDependency", name, devRange);
      }
      return {
        kind: "problem",
        message:
          devRange === undefined
            ? `imports "${name}", which package.json does not declare; add it to dependencies or peerDependencies.`
            : `imports "${name}", a development dependency, at run time; move it to dependencies or peerDependencies.`,
      };
    },
    peers: new Set(Object.keys(manifest.peerDependencies)),
  };
}

export { createDependencyReader };
export type { Dependency, DependencyReader };
