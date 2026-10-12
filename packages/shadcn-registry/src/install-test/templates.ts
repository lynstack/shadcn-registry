import type { Config, TestTemplate } from "#/config.ts";
import { defaultTestTemplates, testTemplates } from "#/config.ts";
import { InstallTestError } from "./install-test-error.ts";

/** How `testRegistry` runs, beyond what the configuration says. */
interface TestRegistryOptions {
  /**
   * The templates to start an app from, which replace the
   * configuration's `test.templates`.
   */
  readonly templates?: readonly TestTemplate[];
}

/**
 * The templates to test, each once in the order first named: those of
 * `options`, else the configuration's `test.templates`, else `vite`.
 * An empty list or a name `shadcn init --template` has no app for throws
 * an `InstallTestError`, as a caller in code passes them unchecked.
 */
function templatesToTest(
  config: Config,
  options: TestRegistryOptions,
): TestTemplate[] {
  const named =
    options.templates ?? config.test?.templates ?? defaultTestTemplates;
  const known: readonly string[] = testTemplates;
  const unknown = named.find((template) => !known.includes(template));
  if (unknown !== undefined) {
    throw new InstallTestError(
      `Unknown template "${unknown}"; use ${testTemplates.join(", ")}.`,
    );
  }
  if (named.length === 0) {
    throw new InstallTestError("Name a template to test.");
  }
  return [...new Set(named)];
}

export { templatesToTest };
export type { TestRegistryOptions };
