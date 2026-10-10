/**
 * A failure of `testRegistry` past the build: a command that exits with
 * an error, a theme token the app's stylesheet lacks, or a run outside a
 * package.json script. Its message tells it all, and names the folder of
 * the app when one was written; the commands have printed their own
 * output. A registry that does not build throws a `RegistryError`
 * instead.
 */
class InstallTestError extends Error {
  /** Always `InstallTestError`. */
  public override readonly name = "InstallTestError";
}

export { InstallTestError };
