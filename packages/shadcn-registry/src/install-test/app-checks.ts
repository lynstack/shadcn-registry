import { Rule, parse } from "postcss";
import { readFileSync } from "node:fs";

import { InstallTestError } from "./install-test-error.ts";
import type { ListedItem } from "./served-registry.ts";
import { runPackageManager } from "./processes.ts";
import { stylesheetOf } from "./test-app.ts";

/** The custom properties of a top-level rule of the app's stylesheet, by name. */
function tokensOf(css: string, selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const node of parse(css).nodes) {
    if (node instanceof Rule && node.selector === selector) {
      node.walkDecls((declaration) => {
        tokens.set(
          declaration.prop,
          declaration.value.replaceAll(/\s+/gu, " "),
        );
      });
    }
  }
  return tokens;
}

/** The tokens of the themes that the app's stylesheet lacks or holds otherwise. */
function missingTokens(appDir: string, items: readonly ListedItem[]): string[] {
  const css = readFileSync(stylesheetOf(appDir), "utf8");
  const groups = [
    [":root", "light"],
    [".dark", "dark"],
  ] as const;
  return groups.flatMap(([selector, group]) => {
    const present = tokensOf(css, selector);
    return items.flatMap((item) =>
      Object.entries(item.cssVars?.[group] ?? {})
        .filter(
          ([name, value]) =>
            present.get(`--${name}`) !== value.replaceAll(/\s+/gu, " "),
        )
        .map(
          ([name, value]) => `${item.name}: ${selector} --${name}: ${value}`,
        ),
    );
  });
}

/** One app of a test: where it is, and the package manager that runs it. */
interface AppRun {
  readonly appDir: string;
  readonly packageManager: string;
}

/**
 * Builds the app and typechecks it with the scripts of its template,
 * the build first, as it writes the types some frameworks generate, then
 * compares its tokens with the themes'.
 */
async function checkApp(
  { appDir, packageManager }: AppRun,
  items: readonly ListedItem[],
): Promise<void> {
  await runPackageManager(packageManager, appDir, ["run", "build"]);
  await runPackageManager(packageManager, appDir, ["run", "typecheck"]);
  const missing = missingTokens(appDir, items);
  if (missing.length > 0) {
    throw new InstallTestError(
      `The app's stylesheet lacks these tokens:\n${missing.join("\n")}`,
    );
  }
}

export { checkApp };
export type { AppRun };
