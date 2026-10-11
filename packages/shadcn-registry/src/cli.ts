#!/usr/bin/env node
import { inspect, parseArgs } from "node:util";
import path from "node:path";
import { watch } from "node:fs";

import { InstallTestError, testRegistry } from "./install-test/install-test.ts";
import {
  compareOutput,
  isInside,
  outputFolderOf,
  writeOutput,
} from "./output.ts";
import type { LoadedConfig } from "./load-config.ts";
import { RegistryError } from "./registry-error.ts";
import { buildRegistry } from "./registry.ts";
import { loadConfig } from "./load-config.ts";

const usage = `Usage: shadcn-registry <command> [--config <file>]

Commands:
  build   Build the registry into its output folder.
  check   Fail when the output folder differs from a fresh build.
  watch   Build, then build again whenever a file under the root changes.
  test    Install every item into a new app with the shadcn CLI, then
          typecheck it, compile its Tailwind CSS and compare its tokens.
          Needs the network; run it from a package.json script.

Options:
  -c, --config <file>  The configuration file; by default the first of
                       shadcn-registry.config.{ts,mts,js,mjs}.
  -h, --help           Show this help.`;

const rebuildDelayMs = 100;

/** Warns, as Vite does, about an outDir that holds the root. */
function warnAboutOutDir(loaded: LoadedConfig, outDir: string): void {
  if (outDir === loaded.root || isInside(outDir, loaded.root)) {
    process.stderr.write(
      "outDir must not be the root or a folder above it, as the build could overwrite the library's files with its output.\n",
    );
  }
}

function build(loaded: LoadedConfig): void {
  const registry = buildRegistry(loaded.config, loaded.root);
  warnAboutOutDir(loaded, registry.outDir);
  const { changed, stale } = writeOutput(registry);
  const relative = path.relative(process.cwd(), registry.outDir) || ".";
  const items = registry.files.size - 1;
  process.stdout.write(
    `Built ${String(items)} ${items === 1 ? "item" : "items"} into ${relative}: ${String(changed.length)} written, ${String(stale.length)} deleted.\n`,
  );
}

function check(loaded: LoadedConfig): boolean {
  const registry = buildRegistry(loaded.config, loaded.root);
  const { changed, stale } = compareOutput(registry);
  if (changed.length === 0 && stale.length === 0) {
    process.stdout.write("The registry is up to date.\n");
    return true;
  }
  process.stderr.write(
    [
      "The registry is out of date; run shadcn-registry build.",
      ...changed.map((name) => `  changed: ${name}`),
      ...stale.map((name) => `  stale: ${name}`),
      "",
    ].join("\n"),
  );
  return false;
}

/** Builds whenever a file under the root changes, outside the output folder. */
function watchRoot(loaded: LoadedConfig): void {
  const { outDir } = outputFolderOf(loaded.config, loaded.root);
  const ignored = (file: string): boolean => {
    const absolute = path.resolve(loaded.root, file);
    return (
      absolute.startsWith(outDir + path.sep) ||
      file
        .split(path.sep)
        .some((part) => part === "node_modules" || part === ".git")
    );
  };
  const run = (): void => {
    try {
      build(loaded);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  };
  let timer: NodeJS.Timeout | undefined = undefined;
  run();
  watch(loaded.root, { recursive: true }, (_event, file) => {
    if (file !== null && !ignored(file)) {
      clearTimeout(timer);
      timer = setTimeout(run, rebuildDelayMs);
    }
  });
  process.stdout.write(
    "Watching for changes; restart to pick up a changed configuration.\n",
  );
}

/** Each command, by name: it runs, then tells whether it succeeded. */
const commands: Readonly<
  Record<string, (loaded: LoadedConfig) => Promise<boolean> | boolean>
> = {
  build: (loaded) => {
    build(loaded);
    return true;
  },
  check,
  test: async (loaded) => {
    await testRegistry(loaded);
    process.stdout.write("Every item installed, typechecked and compiled.\n");
    return true;
  },
  watch: (loaded) => {
    watchRoot(loaded);
    return true;
  },
};

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { short: "c", type: "string" },
      help: { short: "h", type: "boolean" },
    },
  });
  const [name] = positionals;
  const command = name === undefined ? undefined : commands[name];
  if (values.help === true || command === undefined) {
    const isUnknown = name !== undefined && values.help !== true;
    (isUnknown ? process.stderr : process.stdout).write(
      `${isUnknown ? `Unknown command "${name}".\n` : ""}${usage}\n`,
    );
    return values.help === true ? 0 : 1;
  }
  const loaded = await loadConfig(process.cwd(), values.config);
  return (await command(loaded)) ? 0 : 1;
}

/** A problem report, a test failure or a usage mistake as it is, and any other error with its stack and causes. */
function describeError(error: unknown): string {
  if (error instanceof RegistryError || error instanceof InstallTestError) {
    return error.message;
  }
  if (
    error instanceof TypeError &&
    "code" in error &&
    String(error.code).startsWith("ERR_PARSE_ARGS_")
  ) {
    return `${error.message}\n${usage}`;
  }
  return inspect(error);
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${describeError(error)}\n`);
  process.exitCode = 1;
}
