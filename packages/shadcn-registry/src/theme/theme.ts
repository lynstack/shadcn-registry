import { CssSyntaxError, parse } from "postcss";
import type { Root } from "postcss";

import type { CssObject, Entry, PackageImport, Part } from "./stylesheet.ts";
import { StylesheetReader, withoutComments } from "./stylesheet.ts";
import { compact, detailsOf } from "#/item-fields.ts";
import type { DependencyReader } from "#/dependencies.ts";
import type { ItemFields } from "#/item-fields.ts";
import type { Problems } from "#/problems.ts";
import type { ThemeItem } from "#/config.ts";
import { packageNameOf } from "#/resolve.ts";
import { sorted } from "#/order.ts";

/** A theme item's styles, in the shadcn CLI's model. */
interface ThemeParts {
  readonly css: CssObject;
  readonly cssVars: {
    readonly theme: Readonly<Record<string, string>>;
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
  };
  /** The packages the stylesheets' `@import` and `@plugin` rules name. */
  readonly packages: readonly PackageImport[];
}

/** What a theme is read with. */
interface ThemeBuild {
  readonly dependencies: DependencyReader;
  readonly problems: Problems;
  /** The text of a file, from the root. */
  readonly textOf: (file: string) => string;
}

function isBlock(value: CssObject | string | undefined): value is CssObject {
  return typeof value === "object";
}

/**
 * Merges two blocks as the CLI merges an item's CSS into the app's: a
 * rule or at-rule met again adds to the first. A declaration with two
 * values returns the key it conflicts on.
 */
function mergeBlocks(
  into: Record<string, CssObject | string>,
  from: CssObject,
): string | undefined {
  for (const [key, value] of Object.entries(from)) {
    const conflict = mergeValue(into, key, value);
    if (conflict !== undefined) {
      return conflict;
    }
  }
  return undefined;
}

/** Merges one value into a block; returns the key path it conflicts on. */
function mergeValue(
  into: Record<string, CssObject | string>,
  key: string,
  value: CssObject | string,
): string | undefined {
  const existing = into[key];
  if (!isBlock(existing) || !isBlock(value)) {
    if (existing !== undefined && existing !== value) {
      return key;
    }
    into[key] = value;
    return undefined;
  }
  const merged = { ...existing };
  const conflict = mergeBlocks(merged, value);
  into[key] = merged;
  return conflict === undefined ? undefined : `${key} ${conflict}`;
}

/** The entries of one part, by key, blocks met again merged. */
function partOf(
  entries: readonly Entry[],
  part: Part,
  problems: Problems,
): Record<string, CssObject | string> {
  const result: Record<string, CssObject | string> = {};
  for (const entry of entries.filter((candidate) => candidate.part === part)) {
    const conflict = mergeBlocks(result, { [entry.key]: entry.value });
    if (conflict !== undefined) {
      problems.add({
        file: entry.file,
        line: entry.node.source?.start?.line ?? 1,
        message: `"${conflict}" is given two values for ${part}; the registry keeps one value per key, as the shadcn CLI keeps one when it writes a token the app already has, so keep one.`,
      });
    }
  }
  return result;
}

function variablesOf(
  entries: readonly Entry[],
  part: Part,
  problems: Problems,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(partOf(entries, part, problems)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** A stylesheet's tree, or `undefined` after reporting why it cannot be parsed. */
function parseStylesheet(build: ThemeBuild, source: string): Root | undefined {
  try {
    return parse(build.textOf(source), { from: source });
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) {
      throw error;
    }
    build.problems.add({
      file: source,
      line: error.line ?? 1,
      message: `cannot be parsed: ${error.reason}.`,
    });
    return undefined;
  }
}

/**
 * Splits stylesheets into the registry's model: the tokens of `:root`
 * and `.dark`, the `@theme inline` map, and every other rule or at-rule
 * as CSS. `@source` is left out: it points the library's own Tailwind at
 * its files, which the app's Tailwind finds once they are copied.
 */
function readTheme(build: ThemeBuild, sources: readonly string[]): ThemeParts {
  const { problems } = build;
  const packages: PackageImport[] = [];
  const entries = sources.flatMap((source) => {
    const stylesheet = parseStylesheet(build, source);
    if (stylesheet === undefined) {
      return [];
    }
    const reader = new StylesheetReader(source, problems);
    const found = withoutComments(stylesheet).flatMap((node) =>
      reader.entries(node),
    );
    packages.push(...reader.packages);
    return found;
  });
  return {
    css: partOf(entries, "css", problems),
    cssVars: {
      dark: variablesOf(entries, "dark", problems),
      light: variablesOf(entries, "light", problems),
      theme: variablesOf(entries, "theme", problems),
    },
    packages,
  };
}

/** The npm dependencies a theme's `@import` and `@plugin` rules add. */
function themeDependencies(
  build: ThemeBuild,
  packages: readonly PackageImport[],
): string[] {
  return packages.flatMap((imported) => {
    const name = packageNameOf(imported.name) ?? imported.name;
    const dependency = build.dependencies.dependencyOf(name, false);
    if (dependency.kind === "problem") {
      build.problems.add({
        file: imported.file,
        line: imported.line,
        message: dependency.message,
      });
    }
    return dependency.kind === "dependency" ? [dependency.spec] : [];
  });
}

/** A theme item's fields: its details, and its stylesheets as tokens and CSS. */
function themeItemOf(build: ThemeBuild, theme: ThemeItem): ItemFields {
  const parts = readTheme(build, theme.sources);
  return compact({
    ...detailsOf(theme, theme.name),
    css: Object.keys(parts.css).length === 0 ? undefined : parts.css,
    cssVars: parts.cssVars,
    dependencies: sorted(themeDependencies(build, parts.packages)),
    extends: theme.extends,
    name: theme.name,
    type: theme.type,
  });
}

export { themeItemOf };
export type { ThemeBuild, ThemeParts };
