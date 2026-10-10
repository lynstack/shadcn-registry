import type { Server } from "node:http";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";

import { InstallTestError } from "./install-test-error.ts";

/**
 * Runs a command and waits for it without blocking this process, whose
 * server answers the shadcn CLI meanwhile.
 */
async function run(
  cwd: string,
  command: string,
  args: readonly string[],
): Promise<void> {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  await once(child, "exit");
  if (child.exitCode !== 0) {
    throw new InstallTestError(
      `${command} ${args.join(" ")} exited with ${String(child.exitCode)}.`,
    );
  }
}

/** Runs a JavaScript file with this Node.js, which works on every platform. */
async function runNode(
  cwd: string,
  script: string,
  args: readonly string[],
): Promise<void> {
  await run(cwd, process.execPath, [script, ...args]);
}

/**
 * The package manager that runs this command, a native binary or a
 * JavaScript file, as package managers set `npm_execpath` for scripts.
 */
function packageManagerOf(): string {
  const packageManager = process.env["npm_execpath"];
  if (packageManager === undefined || packageManager === "") {
    throw new InstallTestError(
      "Run shadcn-registry test from a package.json script, so that it installs the app with the same package manager.",
    );
  }
  return packageManager;
}

async function runPackageManager(
  packageManager: string,
  cwd: string,
  args: readonly string[],
): Promise<void> {
  await (/\.[cm]?js$/u.test(packageManager)
    ? runNode(cwd, packageManager, args)
    : run(cwd, packageManager, args));
}

/** Serves files by name on a free local port, and returns its base URL. */
async function serveFiles(
  files: ReadonlyMap<string, string>,
): Promise<{ readonly server: Server; readonly url: string }> {
  const ok = 200;
  const notFound = 404;
  const server = createServer((request, response) => {
    const name = (request.url ?? "").split("?")[0]?.split("/").pop() ?? "";
    const body = files.get(name);
    if (body === undefined) {
      response.writeHead(notFound).end();
    } else {
      response.writeHead(ok, { "content-type": "application/json" }).end(body);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The registry server has no port.");
  }
  return { server, url: `http://127.0.0.1:${String(address.port)}` };
}

export { packageManagerOf, runNode, runPackageManager, serveFiles };
