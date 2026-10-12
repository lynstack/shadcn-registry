import { describe, expect, it } from "vitest";

import type { Config, ItemRule, TestOptions, ThemeItem } from "./config.ts";
import { RegistryError } from "./registry-error.ts";
import { validateConfig } from "./config-schema.ts";

/** The problem messages of a value the schema refuses. */
function issuesOf(value: unknown): string[] {
  try {
    validateConfig(value);
  } catch (error) {
    if (error instanceof RegistryError) {
      return error.problems.map((problem) => problem.message);
    }
    throw error;
  }
  throw new Error("The schema accepted the value.");
}

const rule = {
  describe: () => ({ title: "Button" }),
  registryDependencies: ["style"],
  source: "src/components/ui/{item}",
  target: "@ui",
  type: "registry:ui",
} as const satisfies Required<ItemRule>;

const theme = {
  author: "Acme",
  categories: ["theme"],
  description: "The tokens.",
  docs: "Run init.",
  extends: "none",
  meta: { version: 1 },
  name: "style",
  sources: ["src/theme.css"],
  title: "Style",
  type: "registry:style",
} as const satisfies Required<ThemeItem>;

const test = {
  dependencies: { motion: "^12.0.0" },
  templates: ["next", "vite"],
} as const satisfies Required<TestOptions>;

const full = {
  emptyOutDir: false,
  homepage: "https://acme.dev",
  ignore: ["**/*.test.*"],
  installPeers: ["motion"],
  items: [rule],
  name: "acme",
  namespace: "@acme",
  outDir: "public/r",
  test,
  themes: [theme],
  tsconfig: "tsconfig.json",
  url: "https://acme.dev/r/{name}.json",
} as const satisfies Required<Config>;

describe("configuration schema", () => {
  it("accepts every field the configuration's types have", () => {
    expect(validateConfig(full)).toStrictEqual(full);
  });

  it("names each field that is missing, of the wrong type or unknown, at once", () => {
    expect(
      issuesOf({
        items: [{ ...rule, extra: true, type: "registry:widget" }],
        name: 1,
        outdir: "dist",
      }),
    ).toStrictEqual([
      "The configuration needs homepage.",
      `The configuration's items[0].type must be ("registry:block" | "registry:component" | "registry:file" | "registry:hook" | "registry:lib" | "registry:page" | "registry:ui"), not "registry:widget".`,
      "The configuration has items[0].extra, a field it does not know; remove it, or correct its name.",
      "The configuration's name must be string, not 1.",
      "The configuration has outdir, a field it does not know; remove it, or correct its name.",
    ]);
  });

  it("refuses a default export that is no object", () => {
    expect(issuesOf("acme")).toStrictEqual([
      `The configuration's default export must be Object, not "acme".`,
    ]);
  });

  it("refuses a template shadcn init cannot start an app from, and an empty list", () => {
    expect(
      issuesOf({ ...full, test: { templates: ["laravel"] } }),
    ).toStrictEqual([
      `The configuration's test.templates[0] must be ("astro" | "next" | "react-router" | "start" | "vite"), not "laravel".`,
    ]);
    expect(issuesOf({ ...full, test: { templates: [] } })).toStrictEqual([
      "The configuration's test.templates must name a template.",
    ]);
  });

  it("refuses a describe that is no function", () => {
    expect(
      issuesOf({ ...full, items: [{ ...rule, describe: "Button" }] }),
    ).toStrictEqual([
      "The configuration's items[0].describe must be a function.",
    ]);
  });
});
