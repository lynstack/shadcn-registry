import type { BaseIssue, GenericSchema } from "valibot";
import {
  array,
  boolean,
  check,
  custom,
  exactOptional,
  literal,
  picklist,
  pipe,
  record,
  regex,
  safeParse,
  strictObject,
  string,
  unknown,
} from "valibot";

import type { Config, ItemRule } from "./config.ts";
import type { Problem } from "./registry-error.ts";
import { RegistryError } from "./registry-error.ts";

/** Lowercase letters and digits joined by single hyphens, after `@`. */
const namespacePattern = /^@[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const namespaceRule =
  "must be @ and lowercase letters, digits and single hyphens, as the shadcn CLI names a registry";

const strings = array(string());
const optionalString = exactOptional(string());
const optionalStrings = exactOptional(strings);
const meta = record(string(), unknown());
const ranges = record(string(), string());

const namespace = pipe(
  string(),
  regex(
    namespacePattern,
    (issue) => `The namespace ${issue.received} ${namespaceRule}.`,
  ),
);

const url = pipe(
  string(),
  regex(
    /^https?:\/\/.*\{name\}/u,
    (issue) =>
      `The url ${issue.received} must be an http or https URL with {name} where the item's name goes.`,
  ),
);

const describe = custom<NonNullable<ItemRule["describe"]>>(
  (input) => typeof input === "function",
  "must be a function",
);

const itemRule = strictObject({
  describe: exactOptional(describe),
  registryDependencies: optionalStrings,
  source: string(),
  target: string(),
  type: picklist([
    "registry:block",
    "registry:component",
    "registry:file",
    "registry:hook",
    "registry:lib",
    "registry:page",
    "registry:ui",
  ]),
});

const themeItem = strictObject({
  author: optionalString,
  categories: optionalStrings,
  description: optionalString,
  docs: optionalString,
  extends: exactOptional(literal("none")),
  meta: exactOptional(meta),
  name: string(),
  sources: strings,
  title: optionalString,
  type: picklist(["registry:style", "registry:theme"]),
});

const testOptions = strictObject({
  dependencies: exactOptional(ranges),
});

const configObject = strictObject({
  emptyOutDir: exactOptional(boolean()),
  homepage: string(),
  ignore: optionalStrings,
  installPeers: optionalStrings,
  items: array(itemRule),
  name: string(),
  namespace: exactOptional(namespace),
  outDir: optionalString,
  test: exactOptional(testOptions),
  themes: exactOptional(array(themeItem)),
  tsconfig: optionalString,
  url: exactOptional(url),
});

/**
 * The configuration as `Config` describes it, with the shapes of the
 * namespace and the URL items name each other by. Without a URL, a
 * namespace that is not set comes from the name.
 */
const configSchema: GenericSchema<Config> = pipe(
  configObject,
  check(
    (config) =>
      config.namespace !== undefined ||
      config.url !== undefined ||
      namespacePattern.test(`@${config.name}`),
    (issue) =>
      `The name "${issue.input.name}" makes the namespace "@${issue.input.name}", which ${namespaceRule}; rename the registry, or set namespace.`,
  ),
);

/** Where an issue sits, such as `items[2].type`. */
function pathOf(issue: BaseIssue<unknown>): string {
  return (issue.path ?? [])
    .map((item) =>
      typeof item.key === "number"
        ? `[${String(item.key)}]`
        : `.${String(item.key)}`,
    )
    .join("")
    .replace(/^\./u, "");
}

/** An issue of an object: a field it lacks, or one it does not know. */
function fieldMessage(issue: BaseIssue<unknown>, at: string): string {
  return issue.expected === "never"
    ? `The configuration has ${at}, a field it does not know; remove it, or correct its name.`
    : `The configuration needs ${at}.`;
}

/** One issue as a problem: a check's own message, or what a field must be. */
function problemOf(issue: BaseIssue<unknown>): Problem {
  if (issue.kind === "validation") {
    return { message: issue.message };
  }
  const at = pathOf(issue);
  if (issue.type === "strict_object" && at !== "") {
    return { message: fieldMessage(issue, at) };
  }
  const field = at === "" ? "default export" : at;
  return {
    message:
      issue.type === "custom"
        ? `The configuration's ${field} ${issue.message}.`
        : `The configuration's ${field} must be ${issue.expected ?? "valid"}, not ${issue.received}.`,
  };
}

/**
 * Checks a value against the configuration's types and the shapes they
 * cannot tell, as a JavaScript configuration has no types and a
 * TypeScript one is only stripped. Throws a {@link RegistryError} that
 * lists every issue.
 *
 * @param file - The configuration file, from the root, that each problem
 *   names, or `undefined` for a configuration given in code.
 */
function validateConfig(value: unknown, file?: string): Config {
  const result = safeParse(configSchema, value);
  if (!result.success) {
    throw new RegistryError(
      result.issues.map((issue) => ({
        ...problemOf(issue),
        ...(file === undefined ? {} : { file }),
      })),
    );
  }
  return result.output;
}

export { validateConfig };
