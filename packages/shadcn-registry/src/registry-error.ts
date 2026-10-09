/** Something in the source that the registry cannot ship as it is. */
interface Problem {
  /** The file, from the root, with forward slashes. */
  readonly file?: string;
  /** The line in `file`, counted from 1. */
  readonly line?: number;
  /** What is wrong, and how to fix it. */
  readonly message: string;
}

/** A problem as one line of text: `file:line: message`. */
function formatProblem(problem: Problem): string {
  if (problem.file === undefined) {
    return problem.message;
  }
  const at =
    problem.line === undefined
      ? problem.file
      : `${problem.file}:${String(problem.line)}`;
  return `${at}: ${problem.message}`;
}

/** Thrown when a build finds problems; it lists every one it found. */
class RegistryError extends Error {
  /** Every problem; a build sorts them by file, line and message. */
  public readonly problems: readonly Problem[];

  /** @param problems - The problems, in the order the message lists them. */
  public constructor(problems: readonly Problem[]) {
    super(
      [
        `The registry has ${String(problems.length)} problem${problems.length === 1 ? "" : "s"}:`,
        ...problems.map((problem) => `  ${formatProblem(problem)}`),
      ].join("\n"),
    );
    this.name = "RegistryError";
    this.problems = problems;
  }
}

export { RegistryError };
export type { Problem };
