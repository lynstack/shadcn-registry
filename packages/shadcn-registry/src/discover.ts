import type { Dirent } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

import type { Config, ItemRule } from "./config.ts";
import { Problems } from "./problems.ts";

/** One file an item ships, before its content is read. */
interface PlannedFile {
  /** From the root, with forward slashes. */
  readonly path: string;
  /** Where the shadcn CLI writes it, such as `@ui/button/button.tsx`. */
  readonly target: string;
}

/** One item found by a rule. */
interface FoundItem {
  readonly name: string;
  /** The item's folder, from the root, or `undefined` for a one-file item. */
  readonly folder: string | undefined;
  readonly rule: ItemRule;
  readonly files: readonly PlannedFile[];
}

const itemPlaceholder = "{item}";

const defaultIgnore: readonly string[] = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.test-d.*",
  "**/*.stories.*",
  "**/__tests__/**",
  "**/__snapshots__/**",
];

/** A rule's source, taken apart. */
interface SourcePattern {
  /** The folders before the item, such as `src/components/ui`. */
  readonly base: string;
  /** The last segment: `{item}` for a folder, `{item}.ts` or `use-{item}.ts` for a file. */
  readonly last: string;
}

function posix(file: string): string {
  return file.split(path.sep).join("/");
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

/** Why a rule's source is no relative path inside the root, or `undefined`. */
function sourcePathProblem(source: string): string | undefined {
  if (source.includes("\\")) {
    return `The item source "${source}" must separate its folders with forward slashes.`;
  }
  return source
    .split("/")
    .some((segment) => segment === ".." || segment === "") ||
    path.isAbsolute(source)
    ? `The item source "${source}" must be a relative path inside the root.`
    : undefined;
}

/** Why a rule's source cannot name items, or `undefined` when it can. */
function sourceProblem(source: string): string | undefined {
  const last = source.split("/").pop() ?? "";
  const holdsItemOnce =
    source.indexOf(itemPlaceholder) === source.lastIndexOf(itemPlaceholder);
  if (!holdsItemOnce || !last.includes(itemPlaceholder)) {
    return `The item source "${source}" must hold "${itemPlaceholder}" once, in its last segment.`;
  }
  const pathProblem = sourcePathProblem(source);
  if (pathProblem !== undefined) {
    return pathProblem;
  }
  if (last !== itemPlaceholder && !last.includes(".")) {
    return `The item source "${source}" must end in "${itemPlaceholder}" for a folder, or in a file name with an extension.`;
  }
  return undefined;
}

/** Checks a target the way the shadcn CLI does before it writes a file. */
function isSafeTarget(target: string): boolean {
  return (
    !target.split("/").includes("..") &&
    !path.isAbsolute(target) &&
    !target.includes("\\") &&
    target.trim() === target &&
    target !== ""
  );
}

/**
 * Why the CLI would write a rule's files elsewhere than its target says.
 * It knows four aliases and `~/`; it writes any other `@name/` as the
 * folder `name/`, and only a `registry:file` or `registry:page` places a
 * plain path.
 */
function targetProblem(rule: ItemRule): string | undefined {
  const { source, target, type } = rule;
  if (!isSafeTarget(target)) {
    return `The target "${target}" of "${source}" must be a path that stays inside the app.`;
  }
  const isKnown =
    /^@(?:ui|components|lib|hooks)(?:\/|$)/u.test(target) ||
    target.startsWith("~/");
  const placesPaths = type === "registry:file" || type === "registry:page";
  return isKnown || (placesPaths && !target.startsWith("@"))
    ? undefined
    : `The target "${target}" of "${source}" must start with @ui, @components, @lib, @hooks or ~/${placesPaths ? ", or be a path from the app's root" : ""}; the shadcn CLI knows no other alias.`;
}

/** A rule's source, taken apart, or `undefined` after reporting why it cannot be. */
function sourcePatternOf(
  rule: ItemRule,
  problems: Problems,
): SourcePattern | undefined {
  const problem = sourceProblem(rule.source) ?? targetProblem(rule);
  if (problem !== undefined) {
    problems.add({ message: problem });
    return undefined;
  }
  const segments = rule.source.split("/");
  const last = segments.pop() ?? "";
  return { base: segments.join("/"), last };
}

/** What every rule is discovered against. */
interface Discovery {
  readonly root: string;
  readonly ignore: readonly string[];
  readonly problems: Problems;
}

/**
 * The files under `base` that `pattern` matches, from the root. The glob
 * starts in `base`, so a folder such as `[locale]`, `(shop)` or `{a,b}`
 * is never read as glob syntax. Ignored entries are pruned while the
 * glob walks, and filtered again after it, as Node.js never asks about
 * the entries directly in `base`.
 */
function filesOf(
  discovery: Discovery,
  base: string,
  pattern: string,
): string[] {
  const ignore = [...discovery.ignore, "**/node_modules/**"];
  const fromRoot = (entry: Dirent): string =>
    posix(
      path.relative(discovery.root, path.join(entry.parentPath, entry.name)),
    );
  const isIgnored = (entry: Dirent): boolean =>
    ignore.some((glob) => path.matchesGlob(fromRoot(entry), glob));
  return globSync(pattern, {
    cwd: path.join(discovery.root, base),
    exclude: isIgnored,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && !isIgnored(entry))
    .map((entry) => fromRoot(entry));
}

/** The files of a rule's source, grouped by the item each belongs to. */
function filesByItem(
  discovery: Discovery,
  pattern: SourcePattern,
): Map<string, string[]> {
  const isFolder = pattern.last === itemPlaceholder;
  const prefix = pattern.base === "" ? "" : `${pattern.base}/`;
  const [before = "", after = ""] = pattern.last.split(itemPlaceholder);
  const nameOf = new RegExp(
    `^${escapeRegExp(prefix + before)}(?<name>[^/]+)${escapeRegExp(after)}${isFolder ? "/" : "$"}`,
    "u",
  );
  const named = filesOf(discovery, pattern.base, isFolder ? "*/**/*" : "*")
    .toSorted()
    .flatMap((file) => {
      const name = nameOf.exec(file)?.groups?.["name"];
      return name === undefined ? [] : [{ file, name }];
    });
  return new Map(
    [...Map.groupBy(named, (entry) => entry.name)].map(([name, entries]) => [
      name,
      entries.map((entry) => entry.file),
    ]),
  );
}

/** The items of one rule, each with its files and their targets. */
function itemsOfRule(discovery: Discovery, rule: ItemRule): FoundItem[] {
  const pattern = sourcePatternOf(rule, discovery.problems);
  if (pattern === undefined) {
    return [];
  }
  const prefix = pattern.base === "" ? "" : `${pattern.base}/`;
  const targetDir = rule.target.replace(/\/+$/u, "");
  return [...filesByItem(discovery, pattern)].map(([name, files]) => ({
    files: files.map((file) => ({
      path: file,
      target: `${targetDir}/${file.slice(prefix.length)}`,
    })),
    folder: pattern.last === itemPlaceholder ? `${prefix}${name}` : undefined,
    name,
    rule,
  }));
}

/** The files directly in the folder of a folder rule, or none for a file rule. */
function looseFilesOf(discovery: Discovery, rule: ItemRule): string[] {
  const pattern = sourcePatternOf(rule, new Problems());
  if (pattern?.last !== itemPlaceholder) {
    return [];
  }
  return filesOf(discovery, pattern.base, "*");
}

/**
 * Reports the files that sit directly in the folder of a folder rule, such
 * as `src/components/ui/index.ts` for `src/components/ui/{item}`: they
 * match no item of that rule, so they would ship nowhere, or as an item
 * that a broader rule makes of the folder itself.
 */
function checkLooseFiles(
  discovery: Discovery,
  rules: readonly ItemRule[],
  items: readonly FoundItem[],
): void {
  const ownerOf = new Map(
    items.flatMap((item) => item.files.map((file) => [file.path, item])),
  );
  const reported = new Set<string>();
  for (const rule of rules) {
    for (const file of looseFilesOf(discovery, rule)) {
      const owner = ownerOf.get(file);
      const isLeftOver =
        owner === undefined || owner.folder === path.posix.dirname(file);
      if (isLeftOver && !reported.has(file)) {
        reported.add(file);
        discovery.problems.add({
          file,
          message: `sits in the folder of "${rule.source}" but in no item's folder${owner === undefined ? ", so it ships nowhere" : `, so it ships as the item "${owner.name}"`}; move it into an item's folder, or add it to ignore.`,
        });
      }
    }
  }
}

/**
 * Finds every item the rules describe. The rules are tried in order, and
 * a file goes to the first rule whose source holds it, so a narrow rule
 * such as `src/components/ui/{item}` comes before a broad one such as
 * `src/components/{item}`.
 */
function discoverItems(
  root: string,
  config: Pick<Config, "ignore" | "items">,
  problems: Problems,
): FoundItem[] {
  const discovery = { ignore: config.ignore ?? defaultIgnore, problems, root };
  const claimed = new Set<string>();
  const items = config.items.flatMap((rule) => {
    const found: FoundItem[] = [];
    for (const item of itemsOfRule(discovery, rule)) {
      const files = item.files.filter((file) => !claimed.has(file.path));
      if (files.length > 0) {
        found.push({ ...item, files });
      }
      for (const file of files) {
        claimed.add(file.path);
      }
    }
    return found;
  });
  checkLooseFiles(discovery, config.items, items);
  return items;
}

export { discoverItems, posix };
export type { FoundItem, PlannedFile };
