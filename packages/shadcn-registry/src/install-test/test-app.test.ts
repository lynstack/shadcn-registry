import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import path from "node:path";

import {
  packagesToAdd,
  stylesheetOf,
  writeWorkspacePolicy,
} from "./test-app.ts";
import { createProject } from "#test/project.ts";

function readWorkspaceOf(appDir: string): unknown {
  return parseYaml(
    readFileSync(path.join(appDir, "pnpm-workspace.yaml"), "utf8"),
  );
}

/** A library and, inside it, an app its template wrote, which pnpm installed unless `lockfile` says otherwise. */
function libraryWithApp(
  files: Readonly<Record<string, string>>,
  lockfile = "pnpm-lock.yaml",
): {
  readonly appDir: string;
  readonly root: string;
} {
  const root = createProject(files);
  const appDir = path.join(root, "app");
  mkdirSync(appDir);
  writeFileSync(path.join(appDir, lockfile), "");
  return { appDir, root };
}

describe("test app", () => {
  it("adds the library's pnpm policy to the template's workspace, joining lists and maps", () => {
    const { appDir, root } = libraryWithApp({
      "pnpm-workspace.yaml":
        "packages: [packages/*]\ncatalog: { react: 19.3.0 }\nallowBuilds: { '@parcel/watcher': false }\nminimumReleaseAge: 1440\nminimumReleaseAgeExclude: ['@acme/*']\n",
    });
    writeFileSync(
      path.join(appDir, "pnpm-workspace.yaml"),
      "packages: []\nallowBuilds: { esbuild: true }\nminimumReleaseAgeExclude: [prettier]\n",
    );
    writeWorkspacePolicy({ appDir, extra: {}, root });

    expect(readWorkspaceOf(appDir)).toStrictEqual({
      allowBuilds: { "@parcel/watcher": false, esbuild: true },
      minimumReleaseAge: 1440,
      minimumReleaseAgeExclude: ["prettier", "@acme/*"],
      packages: [],
    });
  });

  it("writes the policy into a workspace file when the template has none", () => {
    const { appDir, root } = libraryWithApp({
      "pnpm-workspace.yaml": "minimumReleaseAge: 1440\n",
    });
    writeWorkspacePolicy({ appDir, extra: {}, root });

    expect(readFileSync(path.join(appDir, "pnpm-workspace.yaml"), "utf8")).toBe(
      "minimumReleaseAge: 1440\n",
    );
  });

  it("leaves the workspace of an app another package manager installed, or of a library without a policy", () => {
    const npm = libraryWithApp(
      { "pnpm-workspace.yaml": "minimumReleaseAge: 1440\n" },
      "package-lock.json",
    );
    const bare = libraryWithApp({ "pnpm-workspace.yaml": "packages: []\n" });
    writeWorkspacePolicy({ ...npm, extra: {} });
    writeWorkspacePolicy({ ...bare, extra: {} });

    expect(readdirSync(npm.appDir)).toStrictEqual(["package-lock.json"]);
    expect(readdirSync(bare.appDir)).toStrictEqual(["pnpm-lock.yaml"]);
  });

  it("adds the peers the template lacks, then the configuration's packages", () => {
    const { appDir, root } = libraryWithApp({
      "package.json": JSON.stringify({
        name: "fixture",
        peerDependencies: {
          "@base-ui/react": "^1.9.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
        },
      }),
    });
    writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({
        dependencies: { react: "^19.3.0" },
        peerDependencies: { "react-dom": "^19.3.0" },
      }),
    );

    expect(
      packagesToAdd({ appDir, extra: { motion: "^12.0.0" }, root }),
    ).toStrictEqual(["@base-ui/react@^1.9.0", "motion@^12.0.0"]);
  });

  it("finds the stylesheet the app's components.json names", () => {
    const { appDir } = libraryWithApp({});
    writeFileSync(
      path.join(appDir, "components.json"),
      JSON.stringify({ tailwind: { css: "app/globals.css" } }),
    );

    expect(stylesheetOf(appDir)).toBe(path.join(appDir, "app", "globals.css"));
  });
});
