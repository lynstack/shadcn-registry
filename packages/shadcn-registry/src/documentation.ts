import type {
  DocBlock,
  DocComment,
  DocNode,
  DocSection,
} from "@microsoft/tsdoc";
import {
  DocBlockTag,
  DocCodeSpan,
  DocErrorText,
  DocEscapedText,
  DocLinkTag,
  DocParagraph,
  DocPlainText,
  DocSoftBreak,
  TSDocConfiguration,
  TSDocParser,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import { parseSync } from "oxc-parser";

import type { ItemInfo } from "./config.ts";

/** The details an item's file-level TSDoc comment gives. */
type DocumentedDetails = ItemInfo["documentation"];

const packageDocumentationTag = "@packageDocumentation";
const moduleTag = "@module";
const summaryTag = "@summary";
const categoryTag = "@category";
const notFound = -1;

/** TSDoc with the TypeDoc tags the build reads. */
function createParser(): TSDocParser {
  const configuration = new TSDocConfiguration();
  configuration.addTagDefinitions([
    new TSDocTagDefinition({
      syntaxKind: TSDocTagSyntaxKind.BlockTag,
      tagName: moduleTag,
    }),
    new TSDocTagDefinition({
      syntaxKind: TSDocTagSyntaxKind.BlockTag,
      tagName: summaryTag,
    }),
    new TSDocTagDefinition({
      allowMultiple: true,
      syntaxKind: TSDocTagSyntaxKind.BlockTag,
      tagName: categoryTag,
    }),
  ]);
  return new TSDocParser(configuration);
}

const parser = createParser();

function isFileComment(comment: DocComment): boolean {
  return (
    comment.modifierTagSet.isPackageDocumentation() ||
    blocksTagged(comment, moduleTag).length > 0
  );
}

function textOfInlineNode(node: DocNode): string | undefined {
  if (node instanceof DocCodeSpan) {
    return `\`${node.code}\``;
  }
  if (node instanceof DocEscapedText) {
    return node.decodedText;
  }
  if (node instanceof DocLinkTag) {
    return (
      node.linkText ??
      node.urlDestination ??
      node.codeDestination?.emitAsTsdoc()
    );
  }
  return undefined;
}

function textOfNode(node: DocNode): string {
  if (node instanceof DocPlainText || node instanceof DocErrorText) {
    return node.text;
  }
  if (node instanceof DocSoftBreak) {
    return " ";
  }
  return textOfInlineNode(node) ?? "";
}

function plainTextOf(nodes: readonly DocNode[]): string {
  return nodes
    .map((node) => textOfNode(node))
    .join("")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * The text of each paragraph of a section, as plain text on one line. A
 * tag that TSDoc does not define, such as `@since`, still ends the text:
 * it starts a block, as it does for TypeDoc.
 */
function paragraphsOf(section: DocSection): string[] {
  const paragraphs = section.nodes.filter(
    (node) => node instanceof DocParagraph,
  );
  const lastParagraph = paragraphs.findIndex((paragraph) =>
    paragraph.nodes.some((node) => node instanceof DocBlockTag),
  );
  return (
    lastParagraph === notFound
      ? paragraphs
      : paragraphs.slice(0, lastParagraph + 1)
  )
    .map((paragraph) => {
      const blockTag = paragraph.nodes.findIndex(
        (node) => node instanceof DocBlockTag,
      );
      return plainTextOf(
        blockTag === notFound
          ? paragraph.nodes
          : paragraph.nodes.slice(0, blockTag),
      );
    })
    .filter((text) => text !== "");
}

/** The blocks of a tag, whose name TSDoc reads in any case. */
function blocksTagged(comment: DocComment, tagName: string): DocBlock[] {
  return comment.customBlocks.filter(
    (block) => block.blockTag.tagNameWithUpperCase === tagName.toUpperCase(),
  );
}

function blocksOf(comment: DocComment, tagName: string): string[] {
  return blocksTagged(comment, tagName)
    .map((block) => paragraphsOf(block.content).join(" "))
    .filter((text) => text !== "");
}

function detailsOf(comment: DocComment): DocumentedDetails {
  const description =
    blocksOf(comment, summaryTag)[0] ?? paragraphsOf(comment.summarySection)[0];
  const categories = [...new Set(blocksOf(comment, categoryTag))];
  return {
    ...(description === undefined ? {} : { description }),
    ...(categories.length === 0 ? {} : { categories }),
  };
}

function mayBeFileComment(comment: {
  readonly type: string;
  readonly value: string;
}): boolean {
  const value = comment.value.toLowerCase();
  return (
    comment.type === "Block" &&
    value.startsWith("*") &&
    (value.includes(packageDocumentationTag.toLowerCase()) ||
      value.includes(moduleTag.toLowerCase()))
  );
}

/**
 * Reads the details of an item from the file-level TSDoc comment of its
 * entry: the first doc comment that carries `@packageDocumentation`
 * (TSDoc) or `@module` (TypeDoc). The description is its `@summary`, or
 * else the first paragraph of its summary; each `@category` is one of
 * its categories. Tag names read in any case. `{@link}` reads as its
 * text, code spans keep their backticks, and other inline tags and HTML
 * tags are left out.
 */
function readDocumentation(file: string, text: string): DocumentedDetails {
  const fileComment = parseSync(file, text)
    .comments.filter((comment) => mayBeFileComment(comment))
    .map(
      (comment) =>
        parser.parseString(text.slice(comment.start, comment.end)).docComment,
    )
    .find((comment) => isFileComment(comment));
  return fileComment === undefined ? {} : detailsOf(fileComment);
}

export { readDocumentation };
export type { DocumentedDetails };
