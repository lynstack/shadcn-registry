import type { Problem } from "./registry-error.ts";
import { RegistryError } from "./registry-error.ts";
import { compareText } from "./order.ts";

/** Orders problems by file, then line, then message; those without a file first. */
function compareProblems(left: Problem, right: Problem): number {
  return (
    compareText(left.file ?? "", right.file ?? "") ||
    (left.line ?? 0) - (right.line ?? 0) ||
    compareText(left.message, right.message)
  );
}

/** Collects the problems of one build, so that it reports all of them at once. */
class Problems {
  readonly #list: Problem[] = [];

  public add(problem: Problem): void {
    this.#list.push(problem);
  }

  /** Throws a {@link RegistryError} if any problem was added. */
  public throwIfAny(): void {
    if (this.#list.length > 0) {
      throw new RegistryError(this.#list.toSorted(compareProblems));
    }
  }
}

/** The 1-based line of an offset in a text. */
function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

export { Problems, lineAt };
