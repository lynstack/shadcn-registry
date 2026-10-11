import path from "node:path";

import type { FoundItem } from "./discover.ts";
import type { ItemInfo } from "./config.ts";
import { isScript } from "./source.ts";
import { readDocumentation } from "./documentation.ts";
import { stemOf } from "./placement.ts";

/** The file whose documentation tells about an item. */
function entryOf(item: FoundItem): string | undefined {
  return item.folder === undefined
    ? item.files[0]?.path
    : item.files.find(
        (file) =>
          path.posix.dirname(file.path) === item.folder &&
          stemOf(file.path) === "index",
      )?.path;
}

/** What a rule's `describe` reads about one item. */
function itemInfoOf(
  item: FoundItem,
  textOf: (file: string) => string,
): ItemInfo {
  const entry = entryOf(item);
  return {
    documentation:
      entry === undefined || !isScript(entry)
        ? {}
        : readDocumentation(entry, textOf(entry)),
    files: item.files.map((file) => file.path),
    name: item.name,
  };
}

export { itemInfoOf };
