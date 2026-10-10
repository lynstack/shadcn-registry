# @lynstack/shadcn-registry — Agent Instructions

The command line tool and library that builds a shadcn registry from the
source of a TypeScript 7 component library. What it does for its users is
in `README.md`; this file holds how it is built.

## Commands

Run from this folder:

```sh
pnpm build       # tsdown: dist/index.mjs and dist/cli.mjs, then publint and attw
pnpm typecheck   # tsconfig.json (sources and tests), tsconfig.build.json (isolated declarations)
pnpm lint        # oxlint with type-aware rules
pnpm test        # Vitest
pnpm check       # all of the above
```

## Modules

`src` holds one module per concern. Tests sit next to the modules as
`<name>.test.ts`, named by the module or the behavior they cover. The
modules of one feature that the rest only enters through one module
share a folder, and import the others by `#/`:

- `index.ts`: the public API, re-exported from the modules below.
- `config.ts`: the configuration's types and `defineConfig`.
- `load-config.ts`: finds and imports `shadcn-registry.config.*`, which
  Node.js runs with its own type stripping; no loader is involved.
- `discover.ts`: turns item rules into items, each with its files and
  their targets. The first rule whose source holds a file gets it.
- `source.ts`: reads a script's imports with oxc-parser, never a regular
  expression: static imports, `export … from`, literal `import()` and
  `import("…").T` in types. It reads ES modules only and refuses
  CommonJS: `.cjs` and `.cts` files, `require()` of a module and
  `import x = require()`.
- `resolve.ts`: resolves an import with oxc-resolver against the
  library's tsconfig (`paths` without `baseUrl`, as TypeScript 7 has them)
  and package.json `imports`.
- `project-files.ts`: reads what sits around the library: the
  `pnpm-workspace.yaml` above it and the versions it has installed.
- `dependencies.ts`: turns an imported package into the range the shadcn
  CLI installs, resolving pnpm `catalog:` and `workspace:` ranges.
- `placement.ts`: replays the shadcn CLI's two import rewrites (the
  first maps `@/` and `#/` folders to aliases; the second looks an
  `import` statement up among the files one install writes) and refuses
  a local import that would name another module.
- `component-items.ts`: builds an item from its files' imports, then
  checks each local import against one install of its item.
- `theme/`: the themes, entered through `theme.ts`, which merges a
  theme's stylesheets into one item. `stylesheet.ts` reads one stylesheet
  with postcss into `cssVars` and `css` entries; `stylesheet-checks.ts`
  holds what the CLI cannot write back into the app's stylesheet as it
  was written.
- `registry-json.ts`: the text of `registry.json` and of each
  `<name>.json`, checked against `shadcn/schema`.
- `registry.ts`: `buildRegistry`, which ties the above together.
- `output.ts`: writes a build into its folder, or compares it with one.
- `problems.ts`, `registry-error.ts`: collect every problem of a build
  and throw them as one `RegistryError`.
- `config-checks.ts`: checks what the configuration's types cannot.
- `order.ts`: sorts strings by code unit, the same under every locale.
- `items.ts`: collects every item of a build, themes first.
- `item-fields.ts`: an item's JSON fields, with the empty ones dropped
  and the rest sorted by name.
- `install-test/`: `shadcn-registry test`, entered through
  `install-test.ts`, which installs the registry into a new app from a
  local server; `test-app.ts` writes the app, `processes.ts` runs its
  commands and the server, and `install-test-error.ts` holds the failure
  the CLI prints by its message alone.
- `cli.ts`: the `shadcn-registry` command.

`test/project.ts` writes a temporary project for a test and builds it.

## Rules

- A build either succeeds whole or throws one `RegistryError` that lists
  every problem, each with its file and line. Never stop at the first
  problem, and never write a partial registry.
- Every check in `placement.ts` and `theme/` names the shadcn CLI
  behavior it guards against, in its message or TSDoc. When a newer CLI
  changes that behavior, change the check and its test, and raise the
  `shadcn` peer range.
- Every export `index.ts` reaches carries TSDoc, down to each property
  of an exported type.
- Every problem a build reports is listed under "What it refuses" in
  `README.md`. Add a new check there in the same change.
- The output must be byte-identical for the same input: sort items,
  files, dependencies and item fields with `order.ts`, never
  `localeCompare`, whose order follows the machine's locale.
- Support only TypeScript 7 resolution: `bundler` or `nodenext`, `paths`
  relative to the tsconfig. Do not add `baseUrl` or `node10` handling.
- Support only Tailwind CSS 4 or later: themes are CSS (`@theme inline`),
  never the v3 `tailwind` field or a JavaScript configuration.
