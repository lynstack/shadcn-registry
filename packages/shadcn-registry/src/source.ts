import { Visitor, parseSync } from "oxc-parser";
import path from "node:path";

import type { Problems } from "./problems.ts";
import { lineAt } from "./problems.ts";

/**
 * How a module names another: an `import` statement, `export … from`,
 * `import()`, or a type's `import("…").T`. The shadcn CLI looks only an
 * `import` statement up among the files it installs.
 */
type ImportForm = "dynamic" | "export" | "import" | "type";

/** One module that a source file names. */
interface SourceImport {
  readonly specifier: string;
  readonly form: ImportForm;
  /** Only types come through it: `import type`, or every name marked `type`. */
  readonly typeOnly: boolean;
  readonly line: number;
}

/** What the build reads from a script. */
interface SourceModule {
  readonly imports: readonly SourceImport[];
  readonly documentation: string | undefined;
}

/** The extensions of the ES modules the build reads the imports of. */
const scriptExtensions: ReadonlySet<string> = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

/** The extensions of CommonJS modules, which the build refuses. */
const commonJsExtensions: ReadonlySet<string> = new Set([".cjs", ".cts"]);

const documentationTag = "@packageDocumentation";

function documentationOf(
  comments: readonly { readonly type: string; readonly value: string }[],
): string | undefined {
  const comment = comments.find(
    (candidate) =>
      candidate.type === "Block" && candidate.value.includes(documentationTag),
  );
  return comment?.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/u, "").trim())
    .join(" ")
    .split(documentationTag)[0]
    ?.trim();
}

/** A string literal, or a template literal without substitutions, as written. */
function literalValue(text: string): string | undefined {
  const quote = text.charAt(0);
  if (
    text.length > quote.length &&
    (quote === '"' || quote === "'" || quote === "`") &&
    text.endsWith(quote) &&
    !(quote === "`" && text.includes("${"))
  ) {
    return text.slice(quote.length, text.length - quote.length);
  }
  return undefined;
}

/** The parsed module record of a script, as oxc reads it. */
type ModuleRecord = ReturnType<typeof parseSync>["module"];

/** A script being read, and where its problems go. */
interface Script {
  readonly file: string;
  readonly text: string;
  readonly problems: Problems;
}

function staticImportsOf(script: Script, module: ModuleRecord): SourceImport[] {
  return module.staticImports.map((statement) => ({
    form: "import",
    line: lineAt(script.text, statement.start),
    specifier: statement.moduleRequest.value,
    typeOnly:
      statement.entries.length > 0 &&
      statement.entries.every((entry) => entry.isType),
  }));
}

/** `export … from` and `export * from`; a local `export` names no module. */
function reExportsOf(script: Script, module: ModuleRecord): SourceImport[] {
  return module.staticExports.flatMap((statement): SourceImport[] => {
    const request = statement.entries[0]?.moduleRequest;
    return request === undefined || request === null
      ? []
      : [
          {
            form: "export",
            line: lineAt(script.text, statement.start),
            specifier: request.value,
            typeOnly: statement.entries.every((entry) => entry.isType),
          },
        ];
  });
}

function dynamicImportsOf(
  script: Script,
  module: ModuleRecord,
): SourceImport[] {
  return module.dynamicImports.flatMap((dynamicImport): SourceImport[] => {
    const { start, end } = dynamicImport.moduleRequest;
    const specifier = literalValue(script.text.slice(start, end));
    const line = lineAt(script.text, dynamicImport.start);
    if (specifier === undefined) {
      script.problems.add({
        file: script.file,
        line,
        message:
          "imports a module whose name is computed; name it with a string literal so the build can follow it.",
      });
      return [];
    }
    return [{ form: "dynamic", line, specifier, typeOnly: false }];
  });
}

/**
 * `import("…").T` in a type. `import x = require()` and `require()` of
 * a module name are problems: they load a module through CommonJS, whose
 * imports the build does not follow. A `require` called with anything
 * else, such as an assertion helper, loads nothing.
 */
function typeScriptImportsOf(
  script: Script,
  program: ReturnType<typeof parseSync>["program"],
): SourceImport[] {
  const found: SourceImport[] = [];
  const report = (start: number, message: string): void => {
    script.problems.add({
      file: script.file,
      line: lineAt(script.text, start),
      message: `${message}; the build follows only ES module imports, so use an import statement.`,
    });
  };
  new Visitor({
    CallExpression: (node): void => {
      const [loaded] = node.arguments;
      if (
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        loaded?.type === "Literal" &&
        typeof loaded.value === "string"
      ) {
        report(node.start, `loads "${loaded.value}" with require()`);
      }
    },
    TSImportEqualsDeclaration: (node): void => {
      if (node.moduleReference.type === "TSExternalModuleReference") {
        report(node.start, "uses import … = require(), which is CommonJS");
      }
    },
    TSImportType: (node): void => {
      found.push({
        form: "type",
        line: lineAt(script.text, node.start),
        specifier: node.source.value,
        typeOnly: true,
      });
    },
  }).visit(program);
  return found;
}

/**
 * Reads the imports and the documentation of a script. A dynamic import
 * of anything but a literal is a problem: no build can tell what it loads.
 */
function readSource(
  file: string,
  text: string,
  problems: Problems,
): SourceModule {
  const result = parseSync(file, text);
  const script = { file, problems, text };
  for (const error of result.errors) {
    problems.add({
      file,
      line: lineAt(text, error.labels[0]?.start ?? 0),
      message: `cannot be parsed: ${error.message}`,
    });
  }
  return {
    documentation: documentationOf(result.comments),
    imports: [
      ...staticImportsOf(script, result.module),
      ...reExportsOf(script, result.module),
      ...dynamicImportsOf(script, result.module),
      ...typeScriptImportsOf(script, result.program),
    ].toSorted((left, right) => left.line - right.line),
  };
}

/**
 * Reads a file's imports and documentation when it is an ES module, and
 * returns `undefined` for any other file. A CommonJS module is a problem.
 */
function readScript(
  file: string,
  text: string,
  problems: Problems,
): SourceModule | undefined {
  const extension = path.posix.extname(file);
  if (commonJsExtensions.has(extension)) {
    problems.add({
      file,
      message:
        "is a CommonJS module; the build reads ES modules only, so write it as an ES module (.js, .mjs, .jsx, .ts, .mts or .tsx).",
    });
  }
  return scriptExtensions.has(extension)
    ? readSource(file, text, problems)
    : undefined;
}

export { readScript };
export type { ImportForm, SourceImport, SourceModule };
