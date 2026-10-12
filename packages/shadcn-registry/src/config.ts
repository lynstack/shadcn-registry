/** The kind of a component item, and of each file it ships. */
type ItemType =
  | "registry:block"
  | "registry:component"
  | "registry:file"
  | "registry:hook"
  | "registry:lib"
  | "registry:page"
  | "registry:ui";

/** The kind of an item built from stylesheets. */
type ThemeType = "registry:style" | "registry:theme";

/** What a rule's `describe` reads about one item. */
interface ItemInfo {
  /** The item's name, the `{item}` part of its source path. */
  readonly name: string;
  /** Its files, from the root, with forward slashes, sorted. */
  readonly files: readonly string[];
  /**
   * The details the file-level TSDoc comment of its entry gives, which
   * the item has unless `describe` replaces them. The entry is the file
   * itself for a one-file item, `index.*` for a folder; its comment is
   * the first doc comment that carries `@packageDocumentation` or
   * `@module`.
   */
  readonly documentation: Pick<ItemDetails, "categories" | "description">;
}

/** The fields of an item that the source cannot tell. */
interface ItemDetails {
  /** Defaults to the name in title case: `lyn-provider` reads `Lyn Provider`. */
  readonly title?: string;
  /** What the item is for, in a sentence. */
  readonly description?: string;
  /** Who made the item. */
  readonly author?: string;
  /** Shown by the shadcn CLI once the item is added. */
  readonly docs?: string;
  /** The groups the item belongs to, such as `form`. */
  readonly categories?: readonly string[];
  /** Any other data about the item, written into its JSON as it is. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** Turns one folder or file of the source into one item per match. */
interface ItemRule {
  /**
   * The path, from the root, with forward slashes and `{item}` once, in
   * its last segment, where the item's name goes. A pattern that ends in
   * `{item}` makes an item of each folder, with every file under it:
   * `src/components/ui/{item}`. A pattern with an extension makes an
   * item of each file: `src/hooks/{item}.ts` or `src/hooks/use-{item}.ts`.
   */
  readonly source: string;
  /** The type of each item of the rule, and of each file it ships. */
  readonly type: ItemType;
  /**
   * The folder the shadcn CLI writes the files into: `@ui`, `@components`,
   * `@lib` or `@hooks`, each optionally with a subfolder, or `~/` and a
   * path from the app's root. A `registry:file` or `registry:page` may
   * also name a path from the app's root without `~/`. Each file keeps
   * its path below the part of `source` before `{item}`:
   * `src/components/ui/button/button.tsx` goes to `@ui/button/button.tsx`.
   */
  readonly target: string;
  /**
   * Items every item of the rule depends on, beyond those its imports
   * name: an item of this registry by its name, or another registry's
   * item by its `@namespace/name` or URL. An item of this registry is
   * installed with each item of the rule, so its files count when the
   * build replays the CLI's import lookup; an item never depends on
   * itself.
   */
  readonly registryDependencies?: readonly string[];
  /**
   * The details of each item, from what the source tells about it. Each
   * field it returns replaces the one the item's documentation gives.
   */
  readonly describe?: (item: ItemInfo) => ItemDetails;
}

/** An item built from stylesheets: tokens, the Tailwind theme, base styles. */
interface ThemeItem extends ItemDetails {
  /** The item's name, such as `theme`. */
  readonly name: string;
  /** The item's type. */
  readonly type: ThemeType;
  /**
   * The stylesheets, from the root, read in order. `:root` holds the
   * light tokens, `.dark` the dark ones, `@theme inline` the Tailwind
   * theme; every other rule and at-rule goes to the item's `css`.
   * `@source`, `@theme inline reference` and an `@import` or `@plugin`
   * of `tailwindcss` or a subpath of it, which serve only the library's
   * own Tailwind CSS, are left out.
   */
  readonly sources: readonly string[];
  /**
   * `none` makes `shadcn init` with this item install it instead of
   * shadcn's own style.
   */
  readonly extends?: "none";
}

/**
 * The templates of `shadcn init --template` that `shadcn-registry test`
 * can start an app from. `laravel` is not one, as the shadcn CLI only
 * sets up an app that `laravel new` has created.
 */
const testTemplates = [
  "astro",
  "next",
  "react-router",
  "start",
  "vite",
] as const;

/** A template of `shadcn init --template` that `shadcn-registry test` starts an app from. */
type TestTemplate = (typeof testTemplates)[number];

/** The templates `shadcn-registry test` starts from when none is named. */
const defaultTestTemplates: readonly TestTemplate[] = ["vite"];

/** How `shadcn-registry test` builds the apps it installs the items into. */
interface TestOptions {
  /**
   * The templates of `shadcn init --template` to start an app from, one
   * app each, `["vite"]` by default. The command's `--template` option
   * replaces them.
   */
  readonly templates?: readonly TestTemplate[];
  /**
   * More packages for each app, by name and range, beyond what its
   * template has and the library's peer dependencies it lacks. An entry
   * that names one of those sets its range instead.
   */
  readonly dependencies?: Readonly<Record<string, string>>;
}

/** The configuration of a registry, in `shadcn-registry.config.ts`. */
interface Config {
  /** The registry's name, such as `lyn-ui`. */
  readonly name: string;
  /** The registry's home page, written into `registry.json`. */
  readonly homepage: string;
  /**
   * How items name the items of this registry they depend on, such as
   * `@acme`: `@`, then lowercase letters and digits joined by single
   * hyphens. `@<name>` by default, which an app adds to the `registries`
   * of its `components.json`.
   */
  readonly namespace?: string;
  /**
   * The `http` or `https` URL of each item, with `{name}` for its name,
   * such as `https://example.com/r/{name}.json`. When set, items name the
   * items they depend on by URL instead of by namespace, which needs no
   * setup in the app.
   */
  readonly url?: string;
  /** The TypeScript configuration that resolves imports. `tsconfig.json` by default. */
  readonly tsconfig?: string;
  /**
   * Where `registry.json` and each item's `<name>.json` are written.
   * `public/r` by default. The JSON files in it that the build does not
   * write are deleted: see `emptyOutDir`.
   */
  readonly outDir?: string;
  /**
   * Whether the build deletes the JSON files in `outDir` that it does not
   * write, as Vite empties its `outDir`. `true` by default; `false` keeps
   * them.
   */
  readonly emptyOutDir?: boolean;
  /**
   * The rules that turn the source into component items. A file goes to
   * the first rule whose source holds it.
   */
  readonly items: readonly ItemRule[];
  /** The items built from stylesheets. */
  readonly themes?: readonly ThemeItem[];
  /**
   * Peer dependencies an app may lack, which items that import them list
   * as dependencies with the peer range. Every other peer, such as
   * `react`, is left out: the app has it.
   */
  readonly installPeers?: readonly string[];
  /** How `shadcn-registry test` builds its app. */
  readonly test?: TestOptions;
  /**
   * Files under an item's source that never ship, as globs from the
   * root. Tests, specs, type tests, stories and snapshots by default; setting this
   * replaces the default.
   */
  readonly ignore?: readonly string[];
}

/** Where the output goes when `outDir` is not set. */
const defaultOutDir = "public/r";

/** Gives a configuration its type. */
function defineConfig(config: Config): Config {
  return config;
}

export { defaultOutDir, defaultTestTemplates, defineConfig, testTemplates };
export type {
  Config,
  ItemDetails,
  ItemInfo,
  ItemRule,
  ItemType,
  TestOptions,
  TestTemplate,
  ThemeItem,
  ThemeType,
};
