import { fileURLToPath } from "node:url";
import path from "node:path";

import type { ListedItem, ServedRegistry } from "./served-registry.ts";
import { baseThemeOf, isTheme } from "./served-registry.ts";
import type { TestTemplate } from "#/config.ts";
import { runNode } from "./processes.ts";

/** The shadcn CLI the library has installed, its peer dependency. */
function shadcnBin(): string {
  return fileURLToPath(import.meta.resolve("shadcn"));
}

/**
 * The preset and component library that `shadcn init --defaults` picks,
 * without the Next.js template it also picks.
 */
const defaultStyle: readonly string[] = ["--preset", "nova", "--base", "base"];

/** The folder `shadcn init --template` writes the app into. */
const appName = "app";

/**
 * Creates the app in `folder` with `shadcn init --template` and
 * shadcn's default style, as a user starts one, and returns its folder.
 */
async function createApp(
  folder: string,
  template: TestTemplate,
): Promise<string> {
  await runNode(folder, shadcnBin(), [
    "init",
    "--template",
    template,
    "--name",
    appName,
    "--no-monorepo",
    ...defaultStyle,
  ]);
  return path.join(folder, appName);
}

/**
 * Sets the app up for the registry as a user would before adding items:
 * names the registry's namespace with `shadcn registry add`, then runs
 * `shadcn init` again with the theme that replaces shadcn's own style,
 * if there is one. The theme comes after the app's first install, so
 * that the library's pnpm policy covers the packages it brings.
 */
async function setUpRegistry(
  appDir: string,
  served: ServedRegistry,
): Promise<void> {
  const namespaces = Object.entries(served.registries);
  if (namespaces.length > 0) {
    await runNode(appDir, shadcnBin(), [
      "registry",
      "add",
      ...namespaces.map(([namespace, url]) => `${namespace}=${url}`),
    ]);
  }
  const base = baseThemeOf(served.items);
  if (base !== undefined) {
    await runNode(appDir, shadcnBin(), [
      "init",
      "--force",
      "--no-reinstall",
      served.addressOf(base.name),
    ]);
  }
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

export { addItems, appName, createApp, setUpRegistry };
