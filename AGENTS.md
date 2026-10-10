# shadcn-registry — Agent Instructions

## Overview

This repository holds `@lynstack/shadcn-registry`, a command line tool and
library that builds a shadcn registry (`registry.json` and one
`<item>.json` per item) from the source of a TypeScript 7 component
library. It reads each item's files, npm dependencies and registry
dependencies from the code's imports, and each theme from its
stylesheets, and refuses at build time what the shadcn CLI would install
wrongly.

Stack: TypeScript 7, oxc-parser and oxc-resolver, postcss, a pnpm
workspace on Node.js 24. The libraries it reads use TypeScript 7 and
Tailwind CSS 4 or later. The exact versions live in the catalog of
`pnpm-workspace.yaml` and in `devEngines` and `packageManager` of
`package.json`.

## Build & Run

Run from the repository root:

```sh
pnpm install        # Node.js 24 and pnpm 12; devEngines downloads the pinned Node.js
pnpm check          # Prettier check, then each package's check script
pnpm format         # Format every file with Prettier
```

`pnpm check` must pass before every commit. The package's own commands
are in `packages/shadcn-registry/AGENTS.md`.

## Project Structure

```
packages/shadcn-registry/   The published package (own AGENTS.md)
consumers/                  Libraries that use the package as its users do
pnpm-workspace.yaml         Workspace packages and the dependency catalog
.prettierrc.json            The one Prettier configuration
```

`consumers` holds one private workspace package per kind of library the
tool serves, and `workspace-tokens`, a workspace package one of them
depends on; `consumers/README.md` says what each one stands for. Each
library depends on the package by `workspace:*`, runs its
`shadcn-registry` bin, and commits its built registry in `public/r`, so a
change of the output shows in the diff. Its `check` fails when that
output is stale, or its source does not typecheck or breaks a rule of the
light oxlint set in `consumers/.oxlintrc.json`. Where a library has a
`registry:test` script, it installs the registry into a new app with the
shadcn CLI, which needs the network and runs in CI only.
After a change of the package, run `pnpm --recursive --if-present
registry:build` and review the diff of every `public/r`.

## Code Style

- Write code, comments, commit messages and documentation in American
  English.
- Comment only when truly necessary. If code needs a comment to be
  understood, first rewrite it (better names, smaller functions). A needed
  comment is short and describes the code as it is now, never its history.
  TSDoc on every public export is documentation, not a comment, and is
  always required.
- Stay cross-platform: development, tests and builds work on Windows,
  Linux and macOS. Use path APIs instead of hard-coded separators, write
  registry paths with forward slashes, and never assume a POSIX shell in
  a script the project depends on.

## Git Workflow

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `build:`, `ci:`, `perf:`, `chore:`), one logical change per commit.
- Mark a breaking change with `!` and a `BREAKING CHANGE:` footer. Until
  1.0, a breaking change costs only that note.

## Dependencies

- Add a dependency only when its value clearly outweighs its cost.
- Add languages, runtimes, tools and dependencies at their latest stable
  version (the latest LTS where one exists), never a pre-release. Look the
  version up when adding it; do not rely on memory.
- Pin development dependencies to exact versions in the catalog of
  `pnpm-workspace.yaml`. Only the published package's `dependencies` and
  `peerDependencies` use ranges. Reference GitHub Actions by the major
  version tag of their latest release.
- Use only current, recommended practices. Never use what its maintainers
  have deprecated, marked legacy or discouraged, even if it still works.

## Working Method

### Follow the shadcn CLI, not its documentation alone

The registry is right only when the shadcn CLI installs it right. Each
check the build makes stands for a behavior of the CLI that the source
of the CLI shows, and its test shows the case. When the CLI's behavior
and its documentation differ, the behavior wins; note the difference in
the check.

### Fix the cause, the standard way

Find why a problem happens, then fix that cause everywhere it occurs. The
size of a change is never a reason to recommend a narrower one. These are
signs of a patch; replace them with the real fix:

- Refusing a legitimate source layout because it is hard to support, when
  the shadcn CLI installs it correctly.
- Special-casing one file, project or platform while the shared cause
  stays.
- Relying on an order, a timing or a stale file that happens to work.

### Review your own work before you report it done

Once `pnpm check` passes, read the whole diff again as a reviewer who did
not write it: scope, a test for each behavior that fails when the
behavior breaks, every statement of a fact in sync across AGENTS.md, the
README, TSDoc and tests, TSDoc on every new export, and `!` with a
`BREAKING CHANGE:` footer for a breaking change. For a large change, also
have an agent with fresh context review it.

## Boundaries

- ✅ **Always do:** Run `pnpm check` before every commit. Keep the output
  byte-identical for the same input.
- ⚠️ **Ask first:** Any choice costly to change later: the configuration
  format, a public export, a dependency, the release process.
- 🚫 **Never do:** Disable a check, weaken a test or add an exception to
  get past an obstacle; stop and report instead. Use a pre-release or
  deprecated feature. Claim a performance gain without a measurement.
