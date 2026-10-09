import { ResolverFactory } from "oxc-resolver";
import { isBuiltin } from "node:module";
import path from "node:path";
import { realpathSync } from "node:fs";

import { posix } from "./discover.ts";

/** What an import names. */
type Resolved =
  | { readonly kind: "builtin" }
  | { readonly kind: "file"; readonly file: string }
  | { readonly kind: "missing"; readonly reason: string }
  | { readonly kind: "package"; readonly name: string };

/** Resolves imports as TypeScript does for the root's tsconfig. */
interface ImportResolver {
  /** What `specifier`, imported by `from` (from the root), names. */
  readonly resolve: (from: string, specifier: string) => Resolved;
}

/** The segments of a scoped package name: `@scope` and the name. */
const scopedNameSegments = 2;

/** The package a bare specifier names: `@base-ui/react/button` names `@base-ui/react`. */
function packageNameOf(specifier: string): string | undefined {
  const segments = specifier.split("/");
  const name = segments
    .slice(0, specifier.startsWith("@") ? scopedNameSegments : 1)
    .join("/");
  const isValid = /^(?:@[a-z0-9-][\w.~-]*\/)?[a-z0-9-][\w.~-]*$/u.test(name);
  return isValid ? name : undefined;
}

function isRelative(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

/** The file a resolved path names, from the root, when it is the root's own. */
function localFileOf(realRoot: string, resolved: string): string | undefined {
  const relative = posix(path.relative(realRoot, resolved));
  const isLocal =
    !relative.startsWith("../") &&
    !path.isAbsolute(relative) &&
    !relative.split("/").includes("node_modules");
  return isLocal ? relative : undefined;
}

/** What an import names that resolves to no file of the root. */
function nonLocalOf(
  specifier: string,
  resolved: string | undefined,
  error: string | undefined,
): Resolved {
  const name =
    isRelative(specifier) || specifier.startsWith("#")
      ? undefined
      : packageNameOf(specifier);
  if (name !== undefined) {
    return { kind: "package", name };
  }
  return {
    kind: "missing",
    reason:
      resolved === undefined
        ? (error ?? "it resolves to nothing")
        : `it resolves to ${resolved}, outside the root`,
  };
}

/**
 * A resolver for the root. Under TypeScript 7, `paths` resolve from the
 * tsconfig without `baseUrl`, and module resolution is `bundler` or
 * `nodenext`, which maps `.js` to `.ts`; the resolver covers both, and
 * the `imports` of package.json.
 */
function createResolver(root: string, tsconfig: string): ImportResolver {
  const realRoot = realpathSync(root);
  const factory = new ResolverFactory({
    conditionNames: ["import", "module", "default"],
    extensionAlias: {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    },
    extensions: [
      ".ts",
      ".tsx",
      ".d.ts",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
    ],
    tsconfig: { configFile: path.resolve(root, tsconfig), references: "auto" },
  });
  return {
    resolve: (from, specifier) => {
      if (isBuiltin(specifier)) {
        return { kind: "builtin" };
      }
      const result = factory.resolveFileSync(
        path.join(realRoot, from),
        specifier,
      );
      const file =
        result.path === undefined
          ? undefined
          : localFileOf(realRoot, result.path);
      return file === undefined
        ? nonLocalOf(specifier, result.path, result.error)
        : { file, kind: "file" };
    },
  };
}

export { createResolver, isRelative, packageNameOf };
export type { ImportResolver, Resolved };
