import { cx } from "@lynstack/class-recipe";
import type { ClassValue } from "@lynstack/class-recipe";

export function join(...values: ClassValue[]): string {
  return cx(...values);
}
