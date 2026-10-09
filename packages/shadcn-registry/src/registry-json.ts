import { registryItemSchema, registrySchema } from "shadcn/schema";

import type { Config } from "./config.ts";
import type { ItemFields } from "./item-fields.ts";
import type { Problems } from "./problems.ts";
import { compareText } from "./order.ts";

const itemSchemaUrl = "https://ui.shadcn.com/schema/registry-item.json";
const registrySchemaUrl = "https://ui.shadcn.com/schema/registry.json";
const jsonIndent = 2;

/** A file as an item lists it. */
interface ItemFile {
  readonly path: string;
  readonly target: string;
  readonly type: string;
}

/** The part of a schema check that names what failed. */
interface SchemaResult {
  readonly error?: {
    readonly issues: readonly {
      readonly message: string;
      readonly path: readonly (number | string)[];
    }[];
  };
}

/** Reports each way a value fails the shadcn CLI's own schema. */
function reportSchema(
  file: string,
  result: SchemaResult,
  problems: Problems,
): void {
  for (const issue of result.error?.issues ?? []) {
    problems.add({
      file,
      message: `does not match the shadcn schema at ${issue.path.join(".") || "its root"}: ${issue.message}`,
    });
  }
}

/** An item as `<name>.json` holds it: each file with its content. */
function itemJsonOf(
  item: ItemFields,
  textOf: (file: string) => string,
): ItemFields {
  const files: unknown = item["files"];
  return {
    $schema: itemSchemaUrl,
    ...item,
    ...(Array.isArray(files)
      ? {
          files: files.map((file: Readonly<ItemFile>) => ({
            content: textOf(file.path),
            path: file.path,
            target: file.target,
            type: file.type,
          })),
        }
      : {}),
  };
}

function toJson(value: unknown): string {
  return `${JSON.stringify(value, undefined, jsonIndent)}\n`;
}

/**
 * The text of `registry.json` and of each `<name>.json`, sorted by file
 * name, each checked against the shadcn CLI's schema.
 */
function registryFiles(
  config: Config,
  items: readonly ItemFields[],
  content: {
    readonly problems: Problems;
    readonly textOf: (file: string) => string;
  },
): Map<string, string> {
  const files = new Map<string, unknown>();
  for (const item of items) {
    const json = itemJsonOf(item, content.textOf);
    const file = `${String(item["name"])}.json`;
    reportSchema(file, registryItemSchema.safeParse(json), content.problems);
    files.set(file, json);
  }
  const registry = {
    $schema: registrySchemaUrl,
    homepage: config.homepage,
    items,
    name: config.name,
  };
  reportSchema(
    "registry.json",
    registrySchema.safeParse(registry),
    content.problems,
  );
  files.set("registry.json", registry);
  return new Map(
    [...files]
      .map(([file, value]): [string, string] => [file, toJson(value)])
      .toSorted(([left], [right]) => compareText(left, right)),
  );
}

export { registryFiles };
