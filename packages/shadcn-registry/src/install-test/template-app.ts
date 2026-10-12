import { addItems, createApp, setUpRegistry } from "./shadcn-cli.ts";
import { packagesToAdd, writeWorkspacePolicy } from "./test-app.ts";
import type { LoadedConfig } from "#/load-config.ts";
import type { ServedRegistry } from "./served-registry.ts";
import type { TestApp } from "./test-app.ts";
import type { TestTemplate } from "#/config.ts";
import { checkApp } from "./app-checks.ts";
import { runPackageManager } from "./processes.ts";

/** Where one app of a test starts, and what it installs. */
interface TemplateRun {
  readonly folder: string;
  readonly packageManager: string;
  readonly served: ServedRegistry;
  readonly template: TestTemplate;
}

/**
 * Creates the app from its template, adds the library's peers it lacks
 * and the configuration's `test.dependencies`, installs every item into
 * it, and checks it.
 */
async function testTemplateApp(
  loaded: LoadedConfig,
  { folder, packageManager, served, template }: TemplateRun,
): Promise<void> {
  const appDir = await createApp(folder, template);
  const app: TestApp = {
    appDir,
    extra: loaded.config.test?.dependencies ?? {},
    root: loaded.root,
  };
  writeWorkspacePolicy(app);
  await setUpRegistry(appDir, served);
  const packages = packagesToAdd(app);
  if (packages.length > 0) {
    await runPackageManager(packageManager, appDir, ["add", ...packages]);
  }
  await addItems(appDir, served);
  await checkApp({ appDir, packageManager }, served.items);
}

export { testTemplateApp };
export type { TemplateRun };
