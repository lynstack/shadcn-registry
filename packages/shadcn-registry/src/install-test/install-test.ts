import { Rule, parse } from "postcss";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

import { binOf, writeTestApp } from "./test-app.ts";
import {
  packageManagerOf,
  runNode,
  runPackageManager,
  serveFiles,
} from "./processes.ts";
import { InstallTestError } from "./install-test-error.ts";
import type { LoadedConfig } from "#/load-config.ts";
import { buildRegistry } from "#/registry.ts";

/** What an item of registry.json tells the test. */
interface ListedItem {
  readonly name: string;
  readonly type: string;
  readonly extends?: string;
  readonly registryDependencies?: readonly string[];
  readonly cssVars?: {
    readonly light?: Readonly<Record<string, string>>;
    readonly dark?: Readonly<Record<string, string>>;
  };
}

function isListedItem(value: unknown): value is ListedItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "name") === "string" &&
    typeof Reflect.get(value, "type") === "string"
  );
}

/** The items registry.json lists; the build has checked its shape. */
function itemsOf(registryJson: string): ListedItem[] {
  const registry: unknown = JSON.parse(registryJson);
  const items: unknown =
    typeof registry === "object" && registry !== null
      ? Reflect.get(registry, "items")
      : undefined;
  return Array.isArray(items) ? items.filter((item) => isListedItem(item)) : [];
}

/** The custom properties of a top-level rule of the app's stylesheet, by name. */
function tokensOf(css: string, selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const node of parse(css).nodes) {
    if (node instanceof Rule && node.selector === selector) {
      node.walkDecls((declaration) => {
        tokens.set(
          declaration.prop,
          declaration.value.replaceAll(/\s+/gu, " "),
        );
      });
    }
  }
  return tokens;
}

/** The tokens of the themes that the app's stylesheet lacks or holds otherwise. */
function missingTokens(appDir: string, items: readonly ListedItem[]): string[] {
  const css = readFileSync(path.join(appDir, "src", "index.css"), "utf8");
  const groups = [
    [":root", "light"],
    [".dark", "dark"],
  ] as const;
  return groups.flatMap(([selector, group]) => {
    const present = tokensOf(css, selector);
    return items.flatMap((item) =>
      Object.entries(item.cssVars?.[group] ?? {})
        .filter(
          ([name, value]) =>
            present.get(`--${name}`) !== value.replaceAll(/\s+/gu, " "),
        )
        .map(
          ([name, value]) => `${item.name}: ${selector} --${name}: ${value}`,
        ),
    );
  });
}

/** The registry as the local server serves it, and how the app names its items. */
interface ServedRegistry {
  readonly addressOf: (name: string) => string;
  readonly items: readonly ListedItem[];
  /** The registry's URL by namespace, or none when items name each other by URL. */
  readonly registries: Record<string, string>;
}

/** The shadcn CLI the library has installed, its peer dependency. */
function shadcnBin(): string {
  return fileURLToPath(import.meta.resolve("shadcn"));
}

/** Whether an item is a theme, which `shadcn add` merges into the app's stylesheet. */
function isTheme(item: ListedItem): boolean {
  return item.type === "registry:style" || item.type === "registry:theme";
}

/** The theme that `shadcn init` installs instead of shadcn's own style, if any. */
function baseThemeOf(items: readonly ListedItem[]): ListedItem | undefined {
  return items.find((item) => isTheme(item) && item.extends === "none");
}

/**
 * The preset and component library that `shadcn init --defaults` picks,
 * without the Next.js template it also picks.
 */
const defaultStyle: readonly string[] = ["--preset", "nova", "--base", "base"];

/**
 * Sets the app up as a user would before adding items: names the
 * registry's namespace with `shadcn registry add`, then runs `shadcn
 * init` with the theme that replaces shadcn's own style, or with
 * shadcn's default style when there is none.
 */
async function initApp(appDir: string, served: ServedRegistry): Promise<void> {
  const namespaces = Object.entries(served.registries);
  if (namespaces.length > 0) {
    await runNode(appDir, shadcnBin(), [
      "registry",
      "add",
      ...namespaces.map(([namespace, url]) => `${namespace}=${url}`),
    ]);
  }
  const base = baseThemeOf(served.items);
  await runNode(appDir, shadcnBin(), [
    "init",
    ...(base === undefined ? defaultStyle : [served.addressOf(base.name)]),
  ]);
}

/**
 * Adds with the shadcn CLI every item but the theme `shadcn init`
 * installed, the themes that no other item brings last. An item's file
 * replaces the one `shadcn init` wrote at its path, such as
 * `lib/utils.ts`, as a user answers the CLI's prompt to overwrite it.
 */
async function addItems(appDir: string, served: ServedRegistry): Promise<void> {
  const { addressOf, items } = served;
  const base = baseThemeOf(items);
  const required = new Set(
    items.flatMap((item) => item.registryDependencies ?? []),
  );
  const components = items.filter((item) => !isTheme(item));
  const themes = items.filter(
    (item) =>
      isTheme(item) && item !== base && !required.has(addressOf(item.name)),
  );
  const add = async (group: readonly ListedItem[]): Promise<void> => {
    if (group.length > 0) {
      await runNode(appDir, shadcnBin(), [
        "add",
        ...group.map((item) => addressOf(item.name)),
        "--yes",
        "--overwrite",
      ]);
    }
  };
  await add(components);
  await add(themes);
}

/** Typechecks the app, compiles its Tailwind CSS, and compares its tokens with the themes'. */
async function checkApp(
  appDir: string,
  items: readonly ListedItem[],
): Promise<void> {
  await runNode(appDir, binOf(appDir, "typescript", "tsc"), ["-p", "."]);
  await runNode(appDir, binOf(appDir, "@tailwindcss/cli", "tailwindcss"), [
    "--input",
    "src/index.css",
    "--output",
    path.join(appDir, "compiled.css"),
  ]);
  const missing = missingTokens(appDir, items);
  if (missing.length > 0) {
    throw new InstallTestError(
      `The app's stylesheet lacks these tokens:\n${missing.join("\n")}`,
    );
  }
}

/** Builds the registry onto the local server at `url`, into `files`. */
function serveRegistry(
  loaded: LoadedConfig,
  files: Map<string, string>,
  url: string,
): ServedRegistry {
  const { config } = loaded;
  const local = `${url}/{name}.json`;
  const namespace = config.namespace ?? `@${config.name}`;
  const byUrl = config.url !== undefined;
  const registry = buildRegistry(
    byUrl ? { ...config, url: local } : config,
    loaded.root,
  );
  for (const [name, text] of registry.files) {
    files.set(name, text);
  }
  return {
    addressOf: (name) =>
      byUrl ? local.replace("{name}", name) : `${namespace}/${name}`,
    items: itemsOf(registry.files.get("registry.json") ?? ""),
    registries: byUrl ? {} : { [namespace]: local },
  };
}

/** Where one test installs the registry, and with what. */
interface TestRun {
  readonly appDir: string;
  readonly packageManager: string;
  readonly served: ServedRegistry;
}

/** Writes the app, installs every item into it, and checks it. */
async function installAndCheck(
  loaded: LoadedConfig,
  { appDir, packageManager, served }: TestRun,
): Promise<void> {
  writeTestApp({
    appDir,
    extra: loaded.config.test?.dependencies ?? {},
    root: loaded.root,
  });
  await runPackageManager(packageManager, appDir, ["install"]);
  await initApp(appDir, served);
  await addItems(appDir, served);
  await checkApp(appDir, served.items);
}

/**
 * Installs every item of the registry into a new Vite app with the
 * shadcn CLI, as a user would, from a local server: `shadcn init`, with
 * the theme whose `extends` is `none` if there is one, then `shadcn add`
 * for the rest. Then the app must typecheck, its Tailwind CSS must
 * compile, and its stylesheet must hold every token of the themes. A
 * registry that does not build throws its `RegistryError`, and a run
 * outside a package.json script an `InstallTestError`, before any app is
 * written; an app that fails is kept, and its folder named in the error.
 *
 * @param loaded - The configuration and the folder it was loaded from.
 */
async function testRegistry(loaded: LoadedConfig): Promise<void> {
  const files = new Map<string, string>();
  const { server, url } = await serveFiles(files);
  try {
    const served = serveRegistry(loaded, files, url);
    const packageManager = packageManagerOf();
    const appDir = mkdtempSync(path.join(os.tmpdir(), "shadcn-registry-test-"));
    await installAndCheck(loaded, { appDir, packageManager, served }).catch(
      (error: unknown) => {
        const kept = `The app is kept in ${appDir}.`;
        throw error instanceof InstallTestError
          ? new InstallTestError(`${error.message}\n${kept}`, { cause: error })
          : new Error(`The registry test failed. ${kept}`, { cause: error });
      },
    );
    rmSync(appDir, { force: true, recursive: true });
  } finally {
    server.close();
  }
}

export { InstallTestError } from "./install-test-error.ts";
export { testRegistry };
