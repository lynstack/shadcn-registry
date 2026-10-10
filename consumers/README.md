# Consumers

Each folder but `workspace-tokens` is a library that builds its shadcn
registry with `@lynstack/shadcn-registry`, as its users would. Together
they cover the ways a library can be laid out:

| Consumer           | Stands for                         | What it covers                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-layout`       | A registry in shadcn's own layout  | One file per component (`src/components/ui/{item}.tsx`), `@/` imports, hooks and libs as files, items named by namespace, a `registry:theme`                                                                                                                                                            |
| `package-imports`  | A library also published to npm    | A folder per component, `#/` imports declared in `package.json` `imports` and tsconfig `paths`, a component outside `ui`, folder libs, `@packageDocumentation` as descriptions, `installPeers`, items named by URL, a `registry:style` with media-query tokens and a package `@import`, an ignored test |
| `nodenext`         | A library on `nodenext` resolution | `.js` in every import, `#/` imports with extensions from `package.json` `imports` alone, hooks named `use-*`, a JavaScript configuration, no theme                                                                                                                                                      |
| `workspace-ui`     | A registry in a pnpm monorepo      | A `catalog:` range and a `workspace:^` range on `workspace-tokens`, published as `pnpm publish` would; no `registry:test`, as that package is not on npm                                                                                                                                                |
| `workspace-tokens` | A package the monorepo publishes   | No registry of its own: the workspace package `workspace-ui` depends on                                                                                                                                                                                                                                 |

Components that style classes do it with
[`@lynstack/class-recipe`](https://www.npmjs.com/package/@lynstack/class-recipe):
`cva` for variants and `cx` to join classes. `app-layout` binds them to
`tailwind-merge` in its `lib/utils.ts`, as shadcn's own `cn` does.

`pnpm check` checks that each committed `public/r` is current, that each
source typechecks, and that it passes oxlint. The rules, in
`.oxlintrc.json`, are a light set that each consumer extends: the
correctness rules, React's among them, as a library's own setup would
start. `pnpm --recursive --if-present registry:test` installs the
registry of each consumer that has the script into a new app, which
needs the network.
