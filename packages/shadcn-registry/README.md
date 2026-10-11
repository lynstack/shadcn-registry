# @lynstack/shadcn-registry

Builds a [shadcn registry](https://ui.shadcn.com/docs/registry) from the
source of a TypeScript component library. You say where items live; the
build reads everything else from the code, refuses what the shadcn CLI
would install wrongly, and reports every problem at once, with its file
and line where it has one.

## What it reads

- **Files and targets**: every file of an item, under its folder or the
  one file its rule names, except the ignored ones, with the path the
  shadcn CLI writes it to.
- **npm dependencies**: every package the files import, with the range
  from `package.json`. `catalog:` and `workspace:` ranges become the
  ranges `pnpm publish` would write. Peer dependencies are left out,
  since the app has them. A type-only import may name a development
  dependency, which the item lists in its `devDependencies`.
- **Registry dependencies**: every other item the files import, named by
  `@namespace/name` or by URL, never by a bare name, which the CLI would
  look up in shadcn's own registry.
- **Details**: an item's `description` and `categories` come from the
  file-level TSDoc comment of its entry, the file itself for a one-file
  item and `index.*` for a folder: the first doc comment that carries
  `@packageDocumentation` (TSDoc) or `@module` (TypeDoc). The
  description is its `@summary`, or else the first paragraph of its
  summary; each `@category` adds a category, once. Tag names read in
  any case. `{@link Button | a button}` reads as its text, code spans
  keep their backticks, other inline tags and HTML tags are left out,
  and a block tag, even one TSDoc does not define, ends the text. Other tags are API documentation and are ignored. The `title`
  is the item's name in title case.

  ```ts
  /**
   * Shows a short status next to other content.
   *
   * @category display
   * @packageDocumentation
   */
  ```

- **Themes**: `:root`, `.dark` and `@theme inline` become `cssVars`;
  every other rule and at-rule becomes `css`, merged as the CLI merges it
  into the app. `@source`, `@theme inline reference` and an `@import` or
  `@plugin` of `tailwindcss` or a subpath of it, which serve only the
  library's own Tailwind CSS, are left out. A package `@import` or `@plugin` adds its package as
  a dependency; an `@import` of a stylesheet on the web, such as a
  font's, is kept as it is.

Files and stylesheets are read with `\n` line endings, and items, files,
dependencies and item fields are sorted by code unit, never by locale, so
every checkout on every machine builds the same output.

## What it refuses

The build replays how the CLI rewrites each import, including its lookup
of an `import` statement among the files one install writes (the item's,
and those of every item it depends on through its imports or its rule's
`registryDependencies`). It refuses:

**Imports**

- an import of a file no item ships, or one that cannot be resolved;
- an import of a package `package.json` does not declare, or of a
  development dependency at run time;
- a range an app cannot install: a `catalog:` range no catalog of
  `pnpm-workspace.yaml` defines, a `workspace:` package that is not
  linked, or a `file:`, `link:`, `git:`, `git+…:`, `github:`, `http:`,
  `https:` or `portal:` range;
- a relative import that would point elsewhere once installed;
- an alias import the CLI would leave as it is (in a `registry:file`, a
  JavaScript, `.mts` or `.d.ts` file) or resolve to another module, and
  a local import that is neither relative nor `@/` or `#/`;
- an `import()` whose module name is computed;
- CommonJS, whose imports the build cannot follow: a `.cjs` or `.cts`
  file, `require()` of a module or `import x = require()`;
- a file that is missing, a folder, not UTF-8 text, or cannot be parsed.

**Themes**

- a block nested in a rule, a declaration outside a rule or `@utility`,
  or a key given two values;
- in `:root` and `.dark`, anything but custom properties; in
  `@theme inline`, anything but custom properties and `@keyframes`;
- any `@theme` but `@theme inline` and `@theme inline reference`;
- an `@import` or `@plugin` that names a file or a URL instead of a
  package (an `@import` of a stylesheet on the web is kept), and a
  `@plugin` with options;
- the Tailwind CSS v3 at-rules `@tailwind` and `@config`;
- a stylesheet that cannot be parsed.

**Configuration**

- two items with one name, or a name that is not lowercase letters and
  digits joined by single hyphens;
- an item `source` with backslashes, outside the root, without `{item}`
  once in its last segment, or naming a file without an extension;
- a `target` that is empty, leaves the app, or does not start with
  `@ui`, `@components`, `@lib`, `@hooks` or `~/` (only a `registry:file`
  or `registry:page` may name a plain path);
- a file directly in the folder of a folder rule, which belongs to no
  item of it;
- a rule's `registryDependencies` entry that is a bare name but no item
  of this registry;
- a `namespace` or `url` of the wrong shape, or a `name` that makes a
  namespace of the wrong shape when neither is set, and an
  `installPeers` entry that `package.json` does not list in
  `peerDependencies`;
- a library that has Tailwind CSS older than 4 installed;
- an item, or `registry.json`, that the `shadcn/schema` of the installed
  CLI does not accept.

## Requirements

Node.js 24.11 or later, a library of ES modules, TypeScript 7 for its
own `tsconfig.json`, Tailwind CSS 4 or later, and `shadcn` 4.21.4 or a
later 4.x, whose schema checks every item.

## Install

```sh
pnpm add -D @lynstack/shadcn-registry shadcn
```

## Configure

Create `shadcn-registry.config.ts` next to the library's `package.json`;
`.mts`, `.js` and `.mjs` work too. Node.js runs it directly, so it uses
only erasable TypeScript syntax.

```ts
import { defineConfig } from "@lynstack/shadcn-registry";

export default defineConfig({
  name: "acme",
  homepage: "https://acme.dev",
  outDir: "public/r",
  items: [
    // One item per folder: src/components/ui/button/** is the item "button".
    {
      source: "src/components/ui/{item}",
      type: "registry:ui",
      target: "@ui",
      registryDependencies: ["style"],
    },
    // One item per file: src/hooks/use-media.ts is the item "use-media".
    { source: "src/hooks/{item}.ts", type: "registry:hook", target: "@hooks" },
  ],
  themes: [
    {
      name: "style",
      type: "registry:style",
      extends: "none",
      sources: ["src/theme/tokens.css", "src/theme/theme.css"],
    },
  ],
});
```

- `items` are tried in order, and a file goes to the first rule whose
  `source` holds it: list `src/components/ui/{item}` before
  `src/components/{item}`. A file directly in the folder of a folder rule,
  such as `src/components/ui/index.ts`, belongs to no item of it: move it
  into an item's folder, give it a file rule, or add it to `ignore`.
- `source` is a path with forward slashes, not a glob: a folder such as
  `app/[locale]` or `(shop)` matches itself. A file rule may name more
  than the item, such as `src/hooks/use-{item}.ts`.
- `target` is the folder the CLI writes into. It starts with `@ui`,
  `@components`, `@lib`, `@hooks` or `~/`, the folders the CLI knows; a
  `registry:file` or `registry:page` may also name a path from the app's
  root. Each file keeps its path below the part of `source` before
  `{item}`: `src/components/ui/button/button.tsx` goes to
  `@ui/button/button.tsx`.
- `registryDependencies` names items every item of the rule depends on,
  beyond those its imports name: an item of this registry by its name,
  or another registry's item by its `@namespace/name` or URL.
- `describe(item)` returns an item's `title`, `description`, `author`,
  `docs`, `categories` and `meta`. It receives the item's name, its
  files and the details its documentation gives, and each field it
  returns replaces the one the documentation gives.
- Items name each other `@<name>/<item>` by default; `namespace` changes
  the prefix, and `url`, such as `"https://acme.dev/r/{name}.json"`, names
  them by URL instead, which needs no `registries` entry in the app.
- A theme's `extends: "none"` makes `shadcn init` with it replace
  shadcn's own style.
- `installPeers` names peer dependencies an app may lack: items list them
  as dependencies with the peer range. Other peers, such as `react`, are
  left out.
- `tsconfig` is the TypeScript configuration that resolves imports,
  `tsconfig.json` by default. Paths in the configuration start from the
  folder of the configuration file.
- `ignore` lists the files that never ship, as globs from the root.
  Tests, specs, type tests, stories and snapshots are ignored by default;
  setting `ignore` replaces that list.
- `outDir`, `public/r` by default, is where the build writes. As Vite
  empties its `outDir`, the build deletes the JSON files in it that it
  does not write; `emptyOutDir: false` keeps them. An `outDir` that is
  the root or a folder above it draws a warning: emptied, it loses
  `package.json`.
- `test.dependencies` adds packages to the app of `shadcn-registry test`.

## Run

```sh
shadcn-registry build   # write registry.json and <item>.json into outDir
shadcn-registry check   # fail when outDir differs from a fresh build (for CI)
shadcn-registry watch   # build again whenever a file under the root changes
shadcn-registry test    # install every item into a new app (needs the network)
```

Each command takes `--config <file>` (`-c`) to name the configuration
file; by default it is the first of `shadcn-registry.config.ts`, `.mts`,
`.js` and `.mjs` in the current folder. `watch` skips `outDir`,
`node_modules` and `.git`, and reads the configuration once: restart it
after changing the configuration.

`test` builds the registry onto a local server and writes a Vite app
with React, TypeScript and Tailwind CSS at the versions the library has
installed (the latest of any it lacks), and the library's peer
dependencies. It installs the app with the package manager that runs the
script, then sets it up with the shadcn CLI as a user would: `registry
add` names the registry's namespace, `init` installs the first theme
whose `extends` is `none`, or shadcn's default style (the `nova` preset
on Base UI) when there is none, and `add` installs every other item,
replacing any file `init` wrote at the same path. Then the app must
typecheck, its Tailwind CSS must compile, and its stylesheet must hold
every token of the themes. Run it from a `package.json` script.

## From code

`buildRegistry(config, root)`, `writeOutput` and `compareOutput` do the
same as `build` and `check`, and `testRegistry` does what `test` does
with what `loadConfig` returns. A registry with problems throws a
`RegistryError` that lists them all. `testRegistry` throws that
`RegistryError`, or an `InstallTestError` when it runs outside a
`package.json` script, before it writes any app. Past that, it throws an
`InstallTestError` when a command or a check of the app fails, or an
`Error` whose `cause` is any other failure, and either names the folder
it kept the app in.

## License

MIT
