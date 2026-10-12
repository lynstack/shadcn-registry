/**
 * Builds a shadcn registry from the source of a TypeScript component
 * library: each item's files, npm dependencies and registry dependencies
 * come from its imports, and each theme from its stylesheets.
 *
 * @packageDocumentation
 */

export { buildRegistry } from "./registry.ts";
export type { BuiltRegistry } from "./registry.ts";
export { compareOutput, writeOutput } from "./output.ts";
export type { OutputDifference } from "./output.ts";
export { defineConfig } from "./config.ts";
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
} from "./config.ts";
export { loadConfig } from "./load-config.ts";
export { InstallTestError, testRegistry } from "./install-test/install-test.ts";
export type { TestRegistryOptions } from "./install-test/install-test.ts";
export type { LoadedConfig } from "./load-config.ts";
export { RegistryError } from "./registry-error.ts";
export type { Problem } from "./registry-error.ts";
