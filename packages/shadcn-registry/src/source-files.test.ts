import { describe, expect, it } from "vitest";
import path from "node:path";
import { writeFileSync } from "node:fs";

import { build, createProject, problemsOf } from "#test/project.ts";

describe("source files", () => {
  it("writes CRLF content with LF line endings, so every checkout builds the same registry", () => {
    const lf = build(
      createProject({
        "src/components/ui/badge/badge.tsx":
          "export const a = 1;\nexport const b = 2;\n",
      }),
    );
    const crlf = build(
      createProject({
        "src/components/ui/badge/badge.tsx":
          "export const a = 1;\r\nexport const b = 2;\r\n",
      }),
    );

    expect(crlf.get("badge.json")).toStrictEqual(lf.get("badge.json"));
  });

  it("refuses a file that is not UTF-8 text", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
      "src/components/ui/badge/icon.png": "\u0000",
    });
    writeFileSync(
      path.join(root, "src/components/ui/badge/icon.png"),
      Uint8Array.of(137, 80, 255, 254),
    );

    expect(problemsOf(root)).toStrictEqual([
      "src/components/ui/badge/icon.png is not UTF-8 text, and a registry carries text only.",
    ]);
  });

  it("reports a file it cannot parse", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": "export const = ;\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      expect.stringMatching(
        /^src\/components\/ui\/badge\/badge\.tsx:1 cannot be parsed: /u,
      ),
    ]);
  });

  it("reports an alias that resolves to nothing as unresolved, not as a package", () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { gone } from "~/gone";\nexport const badge = gone;\n`,
    });

    expect(problemsOf(root)).toStrictEqual([
      expect.stringMatching(
        /^src\/components\/ui\/badge\/badge\.tsx:1 cannot resolve "~\/gone": /u,
      ),
    ]);
  });

  it("refuses CommonJS, whose imports it does not follow", () => {
    const root = createProject({
      "src/components/ui/badge/badge.ts": `import tone = require("./tone");\nexport const badge = tone;\n`,
      "src/components/ui/badge/legacy.cjs": `module.exports = require("clsx");\n`,
      "src/components/ui/badge/tone.cts": "export = 1;\n",
    });

    expect(problemsOf(root)).toStrictEqual([
      "src/components/ui/badge/badge.ts:1 uses import … = require(), which is CommonJS; the build follows only ES module imports, so use an import statement.",
      "src/components/ui/badge/legacy.cjs is a CommonJS module; the build reads ES modules only, so write it as an ES module (.js, .mjs, .jsx, .ts, .mts or .tsx).",
      "src/components/ui/badge/tone.cts is a CommonJS module; the build reads ES modules only, so write it as an ES module (.js, .mjs, .jsx, .ts, .mts or .tsx).",
    ]);
  });

  it("refuses require() of a module, and accepts a require that loads nothing", () => {
    const root = createProject({
      "src/components/ui/badge/assert.ts":
        "export function require(condition: boolean): void {\n  if (!condition) throw new Error();\n}\n",
      "src/components/ui/badge/badge.js": `import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const badge = require("clsx");\n`,
      "src/components/ui/badge/check.ts": `import { require } from "./assert";\nrequire(1 > 0);\n`,
    });

    expect(problemsOf(root)).toStrictEqual([
      `src/components/ui/badge/badge.js:3 loads "clsx" with require(); the build follows only ES module imports, so use an import statement.`,
    ]);
  });
});
