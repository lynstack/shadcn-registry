# Changelog

All notable changes to `@lynstack/shadcn-registry` are recorded here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the package follows [Semantic Versioning](https://semver.org/): until
1.0, a minor version may break the configuration or the API.

## [Unreleased]

### Changed

- `shadcn-registry test` sets its app up as a user would: the app is a
  Vite app, and the shadcn CLI writes its `components.json` with
  `registry add` and `init`, from the first theme whose `extends` is
  `none` or else shadcn's default style, before `add` installs the other
  items over what `init` wrote.

## [0.2.0] - 2026-10-11

### Added

- Each item's `description` and `categories` come from the file-level
  TSDoc comment of its entry, with no `describe`: the first doc comment
  that carries `@packageDocumentation` or `@module`, its `@summary` or
  the first paragraph of its summary, and each `@category`. An item of
  0.1.0 whose entry has such a comment gains them in its output.

### Changed

- **Breaking:** `ItemInfo.documentation` holds the `description` and
  `categories` the comment gives instead of its raw text, the text
  before `@packageDocumentation` with any block before the tag and raw
  `{@link}` tags in it. Each field `describe` returns replaces the one
  the comment gives.

## [0.1.0] - 2026-10-10

The first release.

### Added

- `shadcn-registry build`, `check`, `watch` and `test`, each taking
  `--config` (`-c`) to name the configuration file.
- `defineConfig` and a configuration in `shadcn-registry.config.ts`,
  `.mts`, `.js` or `.mjs`: item rules by folder or by file, themes,
  `namespace` or `url` naming, `installPeers`, `ignore`, `tsconfig`,
  `outDir`, `describe(item)` and `test.dependencies`.
- Items read from the code: their files and targets, the npm dependencies
  their imports name with the ranges `pnpm publish` would write for
  `catalog:` and `workspace:`, and the registry dependencies their imports
  name, by `@namespace/name` or by URL.
- `registry:theme` and `registry:style` items read from stylesheets:
  `:root`, `.dark` and `@theme inline` as `cssVars`, other rules and
  at-rules as `css`, and package `@import` and `@plugin` as dependencies.
- Checks that refuse, at build time, what the shadcn CLI would install
  wrongly: imports it would rewrite to another module or leave
  unresolved, ranges an app cannot install, CommonJS, stylesheet syntax it
  cannot merge back, and a configuration or item that `shadcn/schema`
  rejects. A build reports every problem at once, with file and line.
- `shadcn-registry test`, which installs every item into a new React app
  with the shadcn CLI and checks that it typechecks, that its Tailwind CSS
  compiles and that its stylesheet holds every theme token.
- The same from code: `buildRegistry`, `writeOutput`, `compareOutput`,
  `loadConfig` and `testRegistry`, which throw `RegistryError` or
  `InstallTestError`.
- Output that is byte-identical for the same input on every platform.

[Unreleased]: https://github.com/lynstack/shadcn-registry/compare/shadcn-registry@0.2.0...HEAD
[0.2.0]: https://github.com/lynstack/shadcn-registry/releases/tag/shadcn-registry@0.2.0
[0.1.0]: https://github.com/lynstack/shadcn-registry/releases/tag/v0.1.0
