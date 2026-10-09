import {
  checkConfig,
  checkItemNames,
  checkTailwindVersion,
} from "./config-checks.ts";
import { ComponentItems } from "./component-items.ts";
import type { Config } from "./config.ts";
import type { DependencyReader } from "./dependencies.ts";
import type { FoundItem } from "./discover.ts";
import type { ItemFields } from "./item-fields.ts";
import type { Problems } from "./problems.ts";
import { compareText } from "./order.ts";
import { discoverItems } from "./discover.ts";
import { themeItemOf } from "./theme/theme.ts";

/** What one build reads, and where its problems go. */
interface Build {
  readonly config: Config;
  readonly dependencies: DependencyReader;
  readonly problems: Problems;
  readonly root: string;
  readonly textOf: (file: string) => string;
}

/** Every item of the registry: the themes first, then the rest by name. */
function itemsOf(build: Build): ItemFields[] {
  const { config, problems, root } = build;
  checkConfig(config, build.dependencies, problems);
  checkTailwindVersion(root, problems);
  const found = discoverItems(root, config, problems);
  const themes = config.themes ?? [];
  const names = [...themes, ...found].map((item) => item.name);
  checkItemNames(names, problems);
  return [
    ...themes.map((theme) => themeItemOf(build, theme)),
    ...componentItemsOf(build, found, new Set(names)),
  ];
}

/** The items of the rules, by name, each import checked against its install. */
function componentItemsOf(
  build: Build,
  found: readonly FoundItem[],
  names: ReadonlySet<string>,
): ItemFields[] {
  const components = new ComponentItems(build, found, names);
  const items = found
    .toSorted((left, right) => compareText(left.name, right.name))
    .map((item) => components.build(item));
  components.checkInstalls();
  return items;
}

export { itemsOf };
export type { Build };
