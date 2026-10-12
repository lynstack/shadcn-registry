import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { packageManagerOf, serveFiles } from "./processes.ts";
import { InstallTestError } from "./install-test-error.ts";
import type { LoadedConfig } from "#/load-config.ts";
import type { TemplateRun } from "./template-app.ts";
import type { TestRegistryOptions } from "./templates.ts";
import { appName } from "./shadcn-cli.ts";
import { serveRegistry } from "./served-registry.ts";
import { templatesToTest } from "./templates.ts";
import { testTemplateApp } from "./template-app.ts";

/** Tests the app of one template in a new folder, removed when it passes and kept when it fails. */
async function testTemplate(
  loaded: LoadedConfig,
  run: Omit<TemplateRun, "folder">,
): Promise<void> {
  const { template } = run;
  const folder = mkdtempSync(
    path.join(os.tmpdir(), `shadcn-registry-test-${template}-`),
  );
  await testTemplateApp(loaded, { ...run, folder }).catch((error: unknown) => {
    const appDir = path.join(folder, appName);
    const kept = `The ${template} app is kept in ${existsSync(appDir) ? appDir : folder}.`;
    throw error instanceof InstallTestError
      ? new InstallTestError(`${error.message}\n${kept}`, { cause: error })
      : new Error(`The registry test failed. ${kept}`, { cause: error });
  });
  rmSync(folder, { force: true, recursive: true });
}

/** Tests the templates one after another, as each install prints its own output. */
async function testEachTemplate(
  loaded: LoadedConfig,
  run: Omit<TemplateRun, "folder" | "template">,
  templates: readonly TemplateRun["template"][],
): Promise<void> {
  const [template, ...rest] = templates;
  if (template !== undefined) {
    await testTemplate(loaded, { ...run, template });
    await testEachTemplate(loaded, run, rest);
  }
}

/**
 * Installs every item of the registry with the shadcn CLI, as a user
 * would, from a local server, into a new app from each template of
 * `shadcn init --template`: `test.templates` of the configuration,
 * `["vite"]` by default. Each app starts with shadcn's default style;
 * `shadcn init` with the theme whose `extends` is `none`, if there is
 * one, replaces it, and `shadcn add` installs the rest. Then the app must
 * build and typecheck with its own scripts, and its stylesheet must hold
 * every token of the themes. A registry that does not build throws its
 * `RegistryError`, and a run outside a package.json script an
 * `InstallTestError`, before any app is written; the first app that
 * fails is kept, and its template and folder named in the error.
 *
 * @param loaded - The configuration and the folder it was loaded from.
 * @param options - The templates to test, when not the configuration's.
 */
async function testRegistry(
  loaded: LoadedConfig,
  options: TestRegistryOptions = {},
): Promise<void> {
  const templates = templatesToTest(loaded.config, options);
  const files = new Map<string, string>();
  const { server, url } = await serveFiles(files);
  try {
    const served = serveRegistry(loaded, files, url);
    const packageManager = packageManagerOf();
    await testEachTemplate(loaded, { packageManager, served }, templates);
  } finally {
    server.close();
  }
}

export { InstallTestError } from "./install-test-error.ts";
export { testRegistry };
export type { TestRegistryOptions } from "./templates.ts";
