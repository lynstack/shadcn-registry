import { AtRule, Rule } from "postcss";
import type { ChildNode, Container } from "postcss";

/*
 * What the shadcn CLI cannot write back into the app's stylesheet as the
 * library wrote it. Each check names the CLI behavior it guards against.
 */

/**
 * The at-rules of Tailwind CSS v3 that v4 drops or keeps only for
 * compatibility, which the CLI would write into the app's v4 stylesheet
 * as they are, with how to write each for v4.
 */
const tailwind3AtRules: ReadonlyMap<string, string> = new Map([
  [
    "config",
    "the shadcn CLI writes @config into the app's stylesheet as it is, where it would load a Tailwind CSS v3 JavaScript configuration the app does not have; write the theme in CSS with @theme inline, as Tailwind CSS v4 does.",
  ],
  [
    "tailwind",
    "the shadcn CLI writes @tailwind into the app's stylesheet as it is, but @tailwind is a Tailwind CSS v3 directive and the app's stylesheet already imports Tailwind CSS v4; leave it out.",
  ],
]);

/** Whether an `@import` names Tailwind CSS, which the app imports already. */
function isTailwind(imported: string): boolean {
  return imported === "tailwindcss" || imported.startsWith("tailwindcss/");
}

/**
 * Whether an `@import` names a stylesheet on the web, which the CLI
 * writes into the app as it is, such as a font's.
 */
function isRemoteImport(atRule: AtRule, imported: string): boolean {
  return atRule.name === "import" && /^(?:https?:)?\/\//u.test(imported);
}

/**
 * Why the CLI cannot write an `@import` or `@plugin` back as it was: it
 * writes one that names a file as it is, without the file, and writes a
 * `@plugin` without the options of its block.
 */
function importProblem(atRule: AtRule, imported: string): string | undefined {
  if (
    !isRemoteImport(atRule, imported) &&
    /^(?:\.|\/|[a-z]+:)/u.test(imported)
  ) {
    return atRule.name === "import"
      ? `the shadcn CLI writes @import "${imported}" as it is, where it names a file the app does not have; list the stylesheet among the theme's sources instead of importing it.`
      : `the shadcn CLI writes @plugin "${imported}" as it is, where it names a file the app does not have; load the plugin from a package.`;
  }
  const hasOptions =
    atRule.nodes?.some((node) => node.type !== "comment") ?? false;
  return atRule.name === "plugin" && hasOptions
    ? `the shadcn CLI writes @plugin "${imported}" without the options of its block, so the app would load it with its defaults; leave the options out.`
    : undefined;
}

/** Why a node cannot sit in a block of the `css` field, or `undefined`. */
function nestingProblem(
  container: Container,
  node: ChildNode,
): string | undefined {
  const isRule = container instanceof Rule;
  const isUtility = container instanceof AtRule && container.name === "utility";
  if (node.type === "decl" && !isRule && !isUtility) {
    return "the shadcn CLI writes a declaration only inside a rule or @utility.";
  }
  const isBlock =
    node.type === "rule" ||
    (node.type === "atrule" && node.nodes !== undefined);
  if (isRule && isBlock) {
    return "the shadcn CLI flattens a block nested in a rule into another selector; write it as a rule of its own.";
  }
  return undefined;
}

export {
  importProblem,
  isRemoteImport,
  isTailwind,
  nestingProblem,
  tailwind3AtRules,
};
