import { describe, expect, it, vi } from "vitest";
import path from "node:path";

import { InstallTestError, RegistryError, testRegistry } from "./index.ts";
import { baseConfig, createProject } from "#test/project.ts";

const badge = {
  "src/components/ui/badge/badge.tsx": "export const badge = 1;\n",
};

function loadedFrom(root: string): Parameters<typeof testRegistry>[0] {
  return {
    config: baseConfig,
    file: path.join(root, "shadcn-registry.config.ts"),
    root,
  };
}

describe(testRegistry, () => {
  it("throws the RegistryError of a registry that does not build", async () => {
    const root = createProject({
      "src/components/ui/badge/badge.tsx": `import { b } from "b";\nexport const x = b;\n`,
    });

    await expect(testRegistry(loadedFrom(root))).rejects.toBeInstanceOf(
      RegistryError,
    );
  });

  it("throws an InstallTestError outside a package.json script", async () => {
    const loaded = loadedFrom(createProject(badge));
    vi.stubEnv("npm_execpath", "");
    try {
      await expect(testRegistry(loaded)).rejects.toStrictEqual(
        new InstallTestError(
          "Run shadcn-registry test from a package.json script, so that it installs the app with the same package manager.",
        ),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
