import type { ItemDetails } from "./config.ts";
import { compareText } from "./order.ts";

/** An item as the registry writes it: JSON fields by name. */
type ItemFields = Readonly<Record<string, unknown>>;

function titleOf(name: string): string {
  return name
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/** The fields that hold something, sorted by name. */
function compact(fields: ItemFields): ItemFields {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(
        ([, value]) =>
          value !== undefined && !(Array.isArray(value) && value.length === 0),
      )
      .toSorted(([left], [right]) => compareText(left, right)),
  );
}

/** The fields the configuration gives an item, with a title by default. */
function detailsOf(details: ItemDetails, name: string): ItemFields {
  return {
    author: details.author,
    categories: details.categories,
    description: details.description,
    docs: details.docs,
    meta: details.meta,
    title: details.title ?? titleOf(name),
  };
}

export { compact, detailsOf };
export type { ItemFields };
