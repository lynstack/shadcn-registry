import { describe, expect, it } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { createProject } from "#test/project.ts";

const cli = path.join(import.meta.dirname, "cli.ts");
const config = `export default {
  name: "acme",
  homepage: "https://example.com",
  items: [{ source: "src/components/ui/{item}", target: "@ui", type: "registry:ui" }],
};
`;
const badge = {
  "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
};

function runWith(
  env: NodeJS.ProcessEnv,
  root: string,
  ...args: string[]
): { code: number; output: string } {
  const overridden = new Set(
    Object.keys(env).map((name) => name.toUpperCase()),
  );
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !overridden.has(name.toUpperCase()),
    ),
  );
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...inherited, ...env },
  });
  return { code: result.status ?? 1, output: result.stdout + result.stderr };
}

function run(
  root: string,
  ...args: string[]
): { code: number; output: string } {
  return runWith({}, root, ...args);
}

describe("command line", () => {
  it("builds, then checks, from the configuration file in the folder", () => {
    const root = createProject({
      ...badge,
      "shadcn-registry.config.js": config,
    });

    expect(run(root, "check")).toMatchObject({ code: 1 });
    expect(run(root, "build")).toStrictEqual({
      code: 0,
      output: `Built 1 item into ${path.join("public", "r")}: 2 written, 0 deleted.\n`,
    });
    expect(run(root, "check")).toStrictEqual({
      code: 0,
      output: "The registry is up to date.\n",
    });
  });

  it("warns about an outDir that is the root", () => {
    const root = createProject({
      ...badge,
      "shadcn-registry.config.js": config.replace(
        "items:",
        'outDir: ".",\n  emptyOutDir: false,\n  items:',
      ),
    });

    expect(run(root, "build")).toStrictEqual({
      code: 0,
      output: `Built 1 item into .: 2 written, 0 deleted.\noutDir must not be the root or a folder above it, as the build could overwrite the library's files with its output.\n`,
    });
  });

  it("orders items the same under any locale", () => {
    const root = createProject({
      "shadcn-registry.config.js": config,
      "src/components/ui/checkbox/checkbox.tsx": "export const box = 1;\n",
      "src/components/ui/dialog/dialog.tsx": "export const dialog = 1;\n",
    });
    // Czech sorts "ch" after "h", so a locale order puts checkbox last.
    // Windows takes the locale from the system rather than LC_ALL.
    expect(runWith({ LC_ALL: "cs_CZ.UTF-8" }, root, "build").code).toBe(0);
    const registry: unknown = JSON.parse(
      readFileSync(path.join(root, "public", "r", "registry.json"), "utf8"),
    );

    expect(registry).toMatchObject({
      items: [{ name: "checkbox" }, { name: "dialog" }],
    });
  });

  it("reports every problem and exits with 1", () => {
    const root = createProject({
      "shadcn-registry.config.js": config,
      "src/components/ui/badge/badge.tsx": `import { a } from "./a";\nimport { b } from "b";\nexport const x = [a, b];\n`,
    });
    const { code, output } = run(root, "build");

    expect(code).toBe(1);
    expect(output).toContain("The registry has 2 problems:");
  });

  it("refuses a configuration without its required fields", () => {
    const root = createProject({
      "shadcn-registry.config.js": "export default { name: 1 };\n",
    });

    expect(run(root, "build").output).toContain(
      "shadcn-registry.config.js: The configuration needs homepage.\n  shadcn-registry.config.js: The configuration needs items.\n  shadcn-registry.config.js: The configuration's name must be string, not 1.",
    );
  });

  it("shows the usage for an unknown command or option, without a stack", () => {
    const root = createProject(badge);
    const command = run(root, "publish");
    const option = run(root, "build", "--fast");

    expect(command.code).toBe(1);
    expect(command.output).toMatch(
      /^Unknown command "publish"\.\nUsage: shadcn-registry/u,
    );
    expect(option.code).toBe(1);
    expect(option.output).toMatch(
      /^Unknown option '--fast'.*\nUsage: shadcn-registry/su,
    );
    expect(option.output).not.toContain("    at ");
  });

  it("reports a registry that does not build before the test writes an app", () => {
    const root = createProject({
      "shadcn-registry.config.js": config,
      "src/components/ui/badge/badge.tsx": `import { b } from "b";\nexport const x = b;\n`,
    });
    const { code, output } = run(root, "test");

    expect(code).toBe(1);
    expect(output).toMatch(/^The registry has 1 problem:/u);
    expect(output).not.toContain("The app is kept");
    expect(output).not.toContain("    at ");
  });

  it("asks for a package.json script before the test writes an app, without a stack", () => {
    const root = createProject({
      ...badge,
      "shadcn-registry.config.js": config,
    });

    expect(runWith({ npm_execpath: "" }, root, "test")).toStrictEqual({
      code: 1,
      output:
        "Run shadcn-registry test from a package.json script, so that it installs the app with the same package manager.\n",
    });
  });
});
