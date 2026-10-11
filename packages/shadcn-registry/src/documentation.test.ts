import { describe, expect, it } from "vitest";

import { readDocumentation } from "./documentation.ts";

function read(comment: string): ReturnType<typeof readDocumentation> {
  return readDocumentation("index.ts", `${comment}\nexport const a = 1;\n`);
}

describe(readDocumentation, () => {
  it("takes the first paragraph of the summary as the description", () => {
    expect(
      read(`/**
 * Shows a short status
 * next to other content.
 *
 * Use it inside a card.
 *
 * @packageDocumentation
 */`),
    ).toStrictEqual({
      description: "Shows a short status next to other content.",
    });
  });

  it("finds @packageDocumentation anywhere in the comment, and ignores the blocks", () => {
    expect(
      read(`/**
 * Shows a status.
 * @remarks Not a description.
 * @packageDocumentation
 * @example
 * <Badge />
 */`),
    ).toStrictEqual({ description: "Shows a status." });
  });

  it("reads a TypeDoc @module comment", () => {
    expect(
      read("/**\n * Shows a status.\n * @module Badge\n */"),
    ).toStrictEqual({ description: "Shows a status." });
  });

  it("prefers @summary to the summary", () => {
    expect(
      read(`/**
 * A long text about the badge.
 *
 * @summary Shows a status.
 * @module
 */`),
    ).toStrictEqual({ description: "Shows a status." });
  });

  it("reads each @category, in order", () => {
    expect(
      read(`/**
 * Shows a status.
 * @category display
 * @category status
 * @packageDocumentation
 */`),
    ).toStrictEqual({
      categories: ["display", "status"],
      description: "Shows a status.",
    });
  });

  it("reads inline tags as their text and keeps code spans", () => {
    expect(
      read(`/**
 * Wraps {@link Button | a button} or {@link Link}, see
 * {@link https://example.com}; set \`asChild\` to merge, \\{literally\\}.
 * @packageDocumentation
 */`),
    ).toStrictEqual({
      description:
        "Wraps a button or Link, see https://example.com; set `asChild` to merge, {literally}.",
    });
  });

  it("ends the text at a tag TSDoc does not define", () => {
    expect(
      read(`/**
 * Shows a status.
 * @since 1.0
 * @category display
 * @packageDocumentation
 */`),
    ).toStrictEqual({
      categories: ["display"],
      description: "Shows a status.",
    });
  });

  it("reads only a doc comment that carries @packageDocumentation or @module", () => {
    expect(
      readDocumentation(
        "index.ts",
        `/* @packageDocumentation in a plain comment. */
/** Mentions \`@packageDocumentation\` in a code span. */
/** The function. */
export function a() {}
`,
      ),
    ).toStrictEqual({});
  });

  it("takes the first comment that carries the tag", () => {
    expect(
      readDocumentation(
        "index.ts",
        `/** The licence. */
/**
 * Shows a status.
 * @packageDocumentation
 */
/**
 * Not this one.
 * @packageDocumentation
 */
export const a = 1;
`,
      ),
    ).toStrictEqual({ description: "Shows a status." });
  });

  it("reads tag names in any case, and each category once", () => {
    expect(
      read(`/**
 * Shows a status.
 * @Category display
 * @category display
 * @PackageDocumentation
 */`),
    ).toStrictEqual({
      categories: ["display"],
      description: "Shows a status.",
    });
    expect(read("/**\n * Shows a status.\n * @Module\n */")).toStrictEqual({
      description: "Shows a status.",
    });
  });

  it("leaves out inline tags other than link, and HTML tags", () => {
    expect(
      read(`/**
 * Press <kbd>Enter</kbd> {@label X}to send.
 * @packageDocumentation
 */`),
    ).toStrictEqual({ description: "Press Enter to send." });
  });

  it("gives nothing for a comment with no text", () => {
    expect(read("/** @summary\n * @packageDocumentation */")).toStrictEqual({});
  });
});
