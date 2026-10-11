import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";

import {
  installedVersion,
  isRecord,
  readJson,
  readWorkspace,
} from "#/project-files.ts";

/** What the test app is written from. */
interface TestApp {
  /** The library's folder, whose installed packages give the app its versions. */
  readonly root: string;
  /** Where the app goes. */
  readonly appDir: string;
  /** More packages for the app, by name and range. */
  readonly extra: Readonly<Record<string, string>>;
}

/** The packages every test app has: Vite, React, TypeScript and Tailwind CSS v4. */
const appPackages: readonly string[] = [
  "@tailwindcss/cli",
  "@tailwindcss/vite",
  "@types/react",
  "@types/react-dom",
  "@vitejs/plugin-react",
  "react",
  "react-dom",
  "tailwindcss",
  "typescript",
  "vite",
];

/** The settings of the library's pnpm workspace an install needs: its build and release-age policy. */
const workspacePolicy: ReadonlySet<string> = new Set([
  "allowBuilds",
  "minimumReleaseAge",
  "minimumReleaseAgeExclude",
  "onlyBuiltDependencies",
]);

const jsonIndent = 2;

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, undefined, jsonIndent)}\n`);
}

/** The pnpm workspace settings above the library that the app's install needs. */
function policyOf(root: string): Record<string, unknown> {
  const workspace = readWorkspace(root);
  return isRecord(workspace)
    ? Object.fromEntries(
        Object.entries(workspace).filter(([key]) => workspacePolicy.has(key)),
      )
    : {};
}

/** The library's peer dependencies, which the app has, as a real app would. */
function peersOf(root: string): Record<string, string> {
  const manifest = readJson(path.join(root, "package.json"));
  const peers = isRecord(manifest) ? manifest["peerDependencies"] : undefined;
  return isRecord(peers)
    ? Object.fromEntries(
        Object.entries(peers).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}

function devDependenciesOf(app: TestApp): Record<string, string> {
  const versions = Object.fromEntries(
    appPackages.map((name) => [
      name,
      installedVersion(app.root, name) ?? "latest",
    ]),
  );
  for (const [name, range] of Object.entries(peersOf(app.root))) {
    versions[name] = installedVersion(app.root, name) ?? range;
  }
  return { ...versions, ...app.extra };
}

const tsconfig = {
  compilerOptions: {
    jsx: "react-jsx",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    module: "preserve",
    noEmit: true,
    paths: { "@/*": ["./src/*"] },
    skipLibCheck: true,
    strict: true,
    target: "es2022",
    types: [],
  },
  include: ["src", "vite.config.ts"],
};

/** The Vite configuration, whose file is how the shadcn CLI recognizes a Vite app. */
const viteConfig = `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react(), tailwindcss()] });
`;

/** Writes a new Vite app with React, TypeScript and Tailwind CSS v4, for `shadcn init`. */
function writeTestApp(app: TestApp): void {
  const { appDir } = app;
  writeJson(path.join(appDir, "package.json"), {
    devDependencies: devDependenciesOf(app),
    name: "registry-test-app",
    private: true,
    type: "module",
  });
  writeJson(path.join(appDir, "tsconfig.json"), tsconfig);
  writeFileSync(path.join(appDir, "vite.config.ts"), viteConfig);
  writeFileSync(
    path.join(appDir, "pnpm-workspace.yaml"),
    stringifyYaml(policyOf(app.root)),
  );
  mkdirSync(path.join(appDir, "src"), { recursive: true });
  writeFileSync(
    path.join(appDir, "src", "index.css"),
    '@import "tailwindcss";\n',
  );
}

/** The path of a package's bin in the app, which runs with Node.js. */
function binOf(appDir: string, name: string, bin: string): string {
  const directory = path.join(appDir, "node_modules", ...name.split("/"));
  const manifest = readJson(path.join(directory, "package.json"));
  const bins = isRecord(manifest) ? manifest["bin"] : undefined;
  const file = isRecord(bins) ? bins[bin] : bins;
  if (typeof file !== "string") {
    throw new TypeError(`${name} has no ${bin} command.`);
  }
  return path.join(directory, file);
}

export { binOf, writeTestApp };
export type { TestApp };
