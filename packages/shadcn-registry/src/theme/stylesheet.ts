import type { AtRule, ChildNode, Container, Declaration, Rule } from "postcss";

import {
  importProblem,
  isRemoteImport,
  isTailwind,
  nestingProblem,
  tailwind3AtRules,
} from "./stylesheet-checks.ts";
import type { Problems } from "#/problems.ts";

/** A CSS block as the registry's `css` field writes it. */
interface CssObject {
  readonly [selectorOrAtRule: string]: CssObject | string;
}

/** Where a piece of a stylesheet goes: a `cssVars` group, or `css`. */
type Part = "css" | "dark" | "light" | "theme";

/** One piece: a variable without its `--`, or a `css` key. */
interface Entry {
  readonly file: string;
  readonly part: Part;
  readonly key: string;
  readonly value: CssObject | string;
  readonly node: ChildNode;
}

/** A package that an `@import` or `@plugin` names, and where. */
interface PackageImport {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

/** An at-rule as the `css` field names it: `@media (pointer: coarse)`. */
function atRuleKey(atRule: AtRule): string {
  return `@${atRule.name} ${atRule.params}`.trim();
}

/** The module an `@import` or `@plugin` names, without quotes or `url()`. */
function importedOf(atRule: AtRule): string {
  return (
    atRule.params
      .replace(/^url\((?<inner>.*)\)/u, "$<inner>")
      .split(/\s/u)[0]
      ?.replaceAll(/^["']|["']$/gu, "") ?? ""
  );
}

function withoutComments(container: Container): ChildNode[] {
  return (container.nodes ?? []).filter((node) => node.type !== "comment");
}

function valueOf(declaration: Declaration): string {
  const value = declaration.value.trim();
  return declaration.important ? `${value} !important` : value;
}

/**
 * Reads the stylesheets of one file into entries, and reports what the
 * shadcn CLI cannot write back as it was.
 */
class StylesheetReader {
  readonly #file: string;
  readonly #problems: Problems;
  /** The packages the file's `@import` and `@plugin` rules name, where each is named. */
  public readonly packages: PackageImport[] = [];

  public constructor(file: string, problems: Problems) {
    this.#file = file;
    this.#problems = problems;
  }

  /** The entries of one top-level node. */
  public entries(node: ChildNode): Entry[] {
    if (node.type === "rule") {
      return this.#ruleEntries(node);
    }
    if (node.type === "atrule") {
      return this.#atRuleEntries(node);
    }
    if (node.type === "decl") {
      this.#report(
        node,
        "the shadcn CLI writes each top-level key of css as a rule, so a declaration outside one would reach the app as a selector; put it inside a rule.",
      );
    }
    return [];
  }

  #entry(node: ChildNode, piece: Pick<Entry, "key" | "part" | "value">): Entry {
    return { file: this.#file, node, ...piece };
  }

  #report(node: ChildNode, message: string): void {
    this.#problems.add({
      file: this.#file,
      line: node.source?.start?.line ?? 1,
      message,
    });
  }

  #ruleEntries(rule: Rule): Entry[] {
    if (rule.selector === ":root") {
      return this.#variables("light", rule);
    }
    if (rule.selector === ".dark") {
      return this.#variables("dark", rule);
    }
    return [
      this.#entry(rule, {
        key: rule.selector,
        part: "css",
        value: this.#cssObject(rule),
      }),
    ];
  }

  #atRuleEntries(atRule: AtRule): Entry[] {
    const legacy = tailwind3AtRules.get(atRule.name);
    if (legacy !== undefined) {
      this.#report(atRule, legacy);
      return [];
    }
    if (atRule.name === "source") {
      return [];
    }
    if (atRule.name === "import" || atRule.name === "plugin") {
      return this.#importEntries(atRule);
    }
    return atRule.name === "theme"
      ? this.#themeEntries(atRule)
      : [
          this.#entry(atRule, {
            key: atRuleKey(atRule),
            part: "css",
            value: this.#blockOf(atRule),
          }),
        ];
  }

  /**
   * A theme block. `@theme inline reference` only tells the library's own
   * Tailwind CSS which utilities exist, so it is left out: the app maps
   * those utilities itself.
   */
  #themeEntries(atRule: AtRule): Entry[] {
    const options = atRule.params
      .split(/\s+/u)
      .filter(Boolean)
      .toSorted()
      .join(" ");
    if (options === "inline") {
      return this.#variables("theme", atRule);
    }
    if (options === "inline reference") {
      return [];
    }
    this.#report(
      atRule,
      `the shadcn CLI writes every theme variable into the app's @theme inline, where "${atRuleKey(atRule)}" would change meaning: Tailwind CSS would emit its variables or inline their values. Put each value in :root (and .dark), and map it in @theme inline.`,
    );
    return [];
  }

  /**
   * An `@import` or `@plugin`, which the CLI writes at the top of the
   * app's stylesheet. The item depends on the package it names; a
   * stylesheet on the web needs none. Tailwind CSS itself is left out:
   * the app's stylesheet imports it already.
   */
  #importEntries(atRule: AtRule): Entry[] {
    const imported = importedOf(atRule);
    const problem = importProblem(atRule, imported);
    if (problem !== undefined) {
      this.#report(atRule, problem);
    }
    if (problem !== undefined || isTailwind(imported)) {
      return [];
    }
    if (!isRemoteImport(atRule, imported)) {
      this.packages.push({
        file: this.#file,
        line: atRule.source?.start?.line ?? 1,
        name: imported,
      });
    }
    return [
      this.#entry(atRule, { key: atRuleKey(atRule), part: "css", value: {} }),
    ];
  }

  /** The custom properties of a block, as entries of `part`. */
  #variables(part: Part, container: AtRule | Rule): Entry[] {
    return withoutComments(container).flatMap((node): Entry[] => {
      if (node.type === "decl" && node.prop.startsWith("--")) {
        return [
          this.#entry(node, {
            key: node.prop.slice("--".length),
            part,
            value: valueOf(node),
          }),
        ];
      }
      if (
        part === "theme" &&
        node.type === "atrule" &&
        node.name === "keyframes"
      ) {
        return [
          this.#entry(node, {
            key: atRuleKey(node),
            part: "css",
            value: this.#cssObject(node),
          }),
        ];
      }
      this.#report(
        node,
        part === "theme"
          ? `@theme inline may hold only custom properties and keyframes: the shadcn CLI writes each theme variable into the app's @theme inline as "--name: value", and moves only @keyframes there; put other styles in a rule of their own.`
          : `the ${part} tokens may hold only custom properties: the shadcn CLI writes each one into the app's ${part === "dark" ? ".dark" : ":root"} as "--name: value"; put other styles in a rule of their own.`,
      );
      return [];
    });
  }

  /** An at-rule's block, or an empty object for one without, as the CLI writes it. */
  #blockOf(atRule: AtRule): CssObject {
    return atRule.nodes === undefined ? {} : this.#cssObject(atRule);
  }

  /** A block in the shape of the `css` field; each key once. */
  #cssObject(container: Container): CssObject {
    const block: Record<string, CssObject | string> = {};
    for (const node of withoutComments(container)) {
      this.#addTo(block, container, node);
    }
    return block;
  }

  /** Adds one node to a block, or reports why it cannot sit there. */
  #addTo(
    block: Record<string, CssObject | string>,
    container: Container,
    node: ChildNode,
  ): void {
    const problem = nestingProblem(container, node);
    const pair = problem === undefined ? this.#pairOf(node) : undefined;
    if (problem !== undefined) {
      this.#report(node, problem);
    } else if (pair !== undefined && Object.hasOwn(block, pair[0])) {
      this.#report(
        node,
        `"${pair[0]}" is written twice in one block; the registry keeps one value per key, as the shadcn CLI keeps one when it writes a declaration the app's rule already has, so keep one.`,
      );
    } else if (pair !== undefined) {
      const [key, value] = pair;
      block[key] = value;
    }
  }

  #pairOf(node: ChildNode): readonly [string, CssObject | string] | undefined {
    if (node.type === "decl") {
      return [node.prop, valueOf(node)];
    }
    if (node.type === "rule") {
      return [node.selector, this.#cssObject(node)];
    }
    if (node.type === "atrule") {
      return [atRuleKey(node), this.#blockOf(node)];
    }
    return undefined;
  }
}

export { StylesheetReader, withoutComments };
export type { CssObject, Entry, PackageImport, Part };
