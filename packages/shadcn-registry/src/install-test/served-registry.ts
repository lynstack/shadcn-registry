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

/** The registry as the local server serves it, and how the app names its items. */
interface ServedRegistry {
  readonly addressOf: (name: string) => string;
  readonly items: readonly ListedItem[];
  /** The registry's URL by namespace, or none when items name each other by URL. */
  readonly registries: Record<string, string>;
}

/** Whether an item is a theme, which `shadcn add` merges into the app's stylesheet. */
function isTheme(item: ListedItem): boolean {
  return item.type === "registry:style" || item.type === "registry:theme";
}

/** The theme that `shadcn init` installs instead of shadcn's own style, if any. */
function baseThemeOf(items: readonly ListedItem[]): ListedItem | undefined {
  return items.find((item) => isTheme(item) && item.extends === "none");
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

export { baseThemeOf, isTheme, serveRegistry };
export type { ListedItem, ServedRegistry };
