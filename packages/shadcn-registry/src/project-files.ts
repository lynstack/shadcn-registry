import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import path from "node:path";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** The pnpm-workspace.yaml at or above the root, parsed, if any. */
function readWorkspace(root: string): unknown {
  for (
    let directory = path.resolve(root);
    ;
    directory = path.dirname(directory)
  ) {
    const file = path.join(directory, "pnpm-workspace.yaml");
    if (existsSync(file)) {
      return parseYaml(readFileSync(file, "utf8"));
    }
    if (path.dirname(directory) === directory) {
      return undefined;
    }
  }
}

/** The version of a package that the root has in node_modules, installed or linked. */
function installedVersion(root: string, name: string): string | undefined {
  const file = path.join(
    root,
    "node_modules",
    ...name.split("/"),
    "package.json",
  );
  if (!existsSync(file)) {
    return undefined;
  }
  const manifest = readJson(file);
  const version = isRecord(manifest) ? manifest["version"] : undefined;
  return typeof version === "string" ? version : undefined;
}

export { installedVersion, isRecord, readJson, readWorkspace };
