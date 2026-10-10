# shadcn-registry

Turn a TypeScript component library into a
[shadcn registry](https://ui.shadcn.com/docs/registry), straight from its
source.

A shadcn registry lets an app install your components with
`npx shadcn add`. Writing one by hand means keeping a `registry.json` in
sync with the code: every file, every npm dependency, every component
that needs another, every theme token. `@lynstack/shadcn-registry` reads
all of that from the code itself, so the registry cannot drift from it.

## What you write

Only where your items live:

```ts
// shadcn-registry.config.ts
import { defineConfig } from "@lynstack/shadcn-registry";

export default defineConfig({
  name: "acme",
  homepage: "https://acme.dev",
  items: [
    {
      source: "src/components/ui/{item}.tsx",
      type: "registry:ui",
      target: "@ui",
    },
    { source: "src/lib/{item}.ts", type: "registry:lib", target: "@lib" },
  ],
  themes: [
    {
      name: "theme",
      type: "registry:theme",
      sources: ["src/styles/globals.css"],
    },
  ],
});
```

## What you get

`shadcn-registry build` writes `registry.json` and one `<item>.json` per
item into `public/r`, ready to serve:

- **Files**, with the path the shadcn CLI writes each one to.
- **npm dependencies**, from the packages the files import, with the
  ranges in `package.json`, including pnpm `catalog:` and `workspace:`.
- **Registry dependencies**, from the other items the files import.
- **Themes**, from the stylesheets: `:root`, `.dark` and `@theme inline`
  become `cssVars`, the rest becomes `css`.

It also refuses, at build time, what the shadcn CLI would install wrongly:
an import that would point elsewhere once installed, a package that
`package.json` does not declare, CSS the CLI cannot write back as it was.
Every problem is reported at once, with its file and line, and the same
source always builds the same bytes, so `shadcn-registry check` can guard
the registry in CI. `shadcn-registry test` goes further and installs
every item into a new app with the shadcn CLI.

## Get started

```sh
pnpm add -D @lynstack/shadcn-registry shadcn
```

Requires Node.js 24.11 or later, `shadcn` 4.21.4 or a later 4.x, and a
library of ES modules on TypeScript 7 and Tailwind CSS 4 or later. The
[package README](packages/shadcn-registry/README.md) covers every option,
command and check.

## This repository

| Folder                                                 | Holds                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [`packages/shadcn-registry`](packages/shadcn-registry) | The published package                                                                                       |
| [`consumers`](consumers/README.md)                     | Libraries that build their registries with it, one per kind of layout, and a package one of them depends on |

Contributors start with [AGENTS.md](AGENTS.md): `pnpm install`, then
`pnpm check`.

## License

[MIT](LICENSE)
