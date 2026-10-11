import path from "node:path";

import type { SourceImport } from "./source.ts";
import { isRelative } from "./resolve.ts";

/*
 * The shadcn CLI copies a file's text, then rewrites its imports for the
 * app in two passes. The first maps an `@/` or `#/` specifier by its first
 * folders (`@/components/ui/x` to the ui alias), in a `.ts` or `.tsx` file
 * that is not a declaration file nor a `registry:file`. The second, in a
 * `.ts`, `.tsx`, `.js` or `.jsx` file of any type, looks the module of an
 * `import` statement up among the files the install writes: the exact
 * path, its `index` and any file of the same name all count, ranked by
 * extension (`.tsx`, `.ts`, `.js`, `.jsx`, then `.css`), then those under
 * the path first. It never rewrites a relative import. In a file the
 * first pass skips, the second finds an alias import only through the
 * app's own tsconfig or alias prefix, which the library cannot know, so
 * the checks refuse it. These checks replay both passes on each local
 * import and refuse one that would name another module. The CLI's lookup also
 * counts files the app already has; the checks count only those the
 * install writes, as into a new app.
 */

/** The extensions the CLI's lookup tries, best first. */
const lookupExtensions: readonly string[] = [
  ".tsx",
  ".ts",
  ".js",
  ".jsx",
  ".css",
];

/** The files whose import statements the lookup rewrites. */
const lookedUpFiles = new Set([".tsx", ".ts", ".jsx", ".js"]);

/** The folders the first pass maps, with the target alias each goes to. */
const aliasFolders: readonly (readonly [string, string])[] = [
  ["components/ui", "@ui"],
  ["components", "@components"],
  ["hooks", "@hooks"],
  ["lib", "@lib"],
];

/** One file at both ends of an import: in the source, and installed. */
interface InstalledFile {
  readonly path: string;
  readonly target: string;
  /** The CLI copies it without rewriting any import: a `registry:file`. */
  readonly copiedAsIs: boolean;
}

/** One local import, with the files on both ends. */
interface LocalImport {
  readonly from: InstalledFile;
  readonly to: InstalledFile;
  readonly import: SourceImport;
  /** The targets of every file one install of the importing item writes. */
  readonly installed: readonly string[];
}

/** The module a path names: without a script extension or a trailing `/index`. */
function moduleOf(file: string): string {
  return file
    .replace(/\.d\.[cm]?ts$|\.(?:[cm]?[jt]s|[jt]sx)$/u, "")
    .replace(/(?:^|\/)index$/u, "");
}

/** A file's name without its extension: `x` for `x.tsx` and `x.d.ts`. */
function stemOf(file: string): string {
  return path.posix.basename(file).replace(/\.d\.m?ts$|\.[^.]+$/u, "");
}

/** Where the first pass sends an `@/` or `#/` specifier, in target terms. */
function firstRewriteOf(specifier: string): string | undefined {
  const rest = specifier.replace(/^[@#]\//u, "");
  const match = aliasFolders.find(
    ([folder]) => rest === folder || rest.startsWith(`${folder}/`),
  );
  return match === undefined
    ? undefined
    : `${match[1]}${rest.slice(match[0].length)}`;
}

/** Whether the first pass rewrites the imports of a file. */
function isRewritten(file: InstalledFile): boolean {
  return (
    !file.copiedAsIs &&
    /\.tsx?$/u.test(file.target) &&
    !file.target.endsWith(".d.ts")
  );
}

/** Whether the lookup takes `file` for a module path and name. */
function isCandidate(
  file: string,
  module: { readonly base: string | undefined; readonly name: string },
  extensions: readonly string[],
): boolean {
  return extensions.some(
    (extension) =>
      (module.base !== undefined &&
        (file === `${module.base}${extension}` ||
          file === `${module.base}/index${extension}`)) ||
      file.endsWith(`/${module.name}${extension}`),
  );
}

/** The file the CLI's lookup picks for a specifier, as its target. */
function lookUp(
  specifier: string,
  rewritten: string | undefined,
  installed: readonly string[],
): string | undefined {
  const extension = path.posix.extname(specifier);
  const extensions = extension === "" ? lookupExtensions : [extension];
  const base = rewritten?.slice(0, rewritten.length - extension.length);
  const module = { base, name: path.posix.basename(specifier, extension) };
  const extensionRank = (file: string): number =>
    extensions.indexOf(path.posix.extname(file));
  const placeRank = (file: string): number =>
    base !== undefined && file.startsWith(base) ? 0 : 1;
  return installed
    .filter((file) => isCandidate(file, module, extensions))
    .toSorted(
      (left, right) =>
        extensionRank(left) - extensionRank(right) ||
        placeRank(left) - placeRank(right),
    )[0];
}

/** Why a relative import would name another module once installed. */
function relativeProblem(local: LocalImport): string | undefined {
  const { from, to } = local;
  const { specifier } = local.import;
  const named = moduleOf(
    path.posix.join(path.posix.dirname(from.target), specifier),
  );
  return named === moduleOf(to.target)
    ? undefined
    : `"${specifier}" no longer names ${to.path} once installed, as ${from.target} and ${to.target}; the shadcn CLI never rewrites a relative import, so import it through an alias such as #/ or @/.`;
}

/** Why the CLI would leave an alias import as it is written, or `undefined`. */
function unrewrittenProblem(local: LocalImport): string | undefined {
  const { specifier } = local.import;
  if (!specifier.startsWith("@/") && !specifier.startsWith("#/")) {
    return `"${specifier}" is a local import the shadcn CLI does not rewrite; name it with a relative path, #/ or @/.`;
  }
  return isRewritten(local.from)
    ? undefined
    : `"${specifier}" is an alias import in a file whose aliases the shadcn CLI does not map (a registry:file, JavaScript, .mts or .d.ts), so it resolves only through the app's own aliases; use a relative path.`;
}

/** Why an alias import would name another module once installed. */
function aliasProblem(local: LocalImport): string | undefined {
  const { from, to } = local;
  const { form, specifier } = local.import;
  const rewritten = firstRewriteOf(specifier);
  const isLookedUp =
    form === "import" && lookedUpFiles.has(path.posix.extname(from.target));
  const picked = isLookedUp
    ? lookUp(specifier, rewritten, local.installed)
    : undefined;
  if (picked !== undefined) {
    return picked === to.target
      ? undefined
      : `"${specifier}" names ${to.path}, but the shadcn CLI resolves it to ${picked}, which the same install writes and its lookup prefers; import the module itself, or rename one of them.`;
  }
  return rewritten !== undefined && moduleOf(rewritten) === moduleOf(to.target)
    ? undefined
    : `"${specifier}" names ${rewritten ?? "no folder the shadcn CLI knows"} once installed, but ${to.path} is installed as ${to.target}; ${isLookedUp ? "the CLI finds no module of that name among the files it writes" : "the CLI looks up only import statements among the files it writes"}, so match the source folders to the targets.`;
}

/**
 * Why a local import would name the wrong module once installed, or
 * `undefined` when it holds.
 */
function placementProblem(local: LocalImport): string | undefined {
  return isRelative(local.import.specifier)
    ? relativeProblem(local)
    : (unrewrittenProblem(local) ?? aliasProblem(local));
}

export { placementProblem, stemOf };
export type { InstalledFile, LocalImport };
