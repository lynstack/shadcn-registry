import { describe, expect, it } from "vitest";

import type { Config, TestTemplate } from "#/config.ts";
import { InstallTestError } from "./install-test-error.ts";
import { templatesToTest } from "./templates.ts";

const config: Config = {
  homepage: "https://example.com",
  items: [],
  name: "acme",
};

function withTemplates(templates: readonly TestTemplate[]): Config {
  return { ...config, test: { templates } };
}

/** Names typed as templates without a check, as a JavaScript caller passes them. */
function unchecked(names: readonly string[]): readonly TestTemplate[] {
  return names.filter((name): name is TestTemplate => name !== "");
}

describe("templates to test", () => {
  it("takes the options' templates, then the configuration's, then vite", () => {
    expect(
      templatesToTest(withTemplates(["next"]), { templates: ["astro"] }),
    ).toStrictEqual(["astro"]);
    expect(templatesToTest(withTemplates(["next"]), {})).toStrictEqual([
      "next",
    ]);
    expect(templatesToTest(config, {})).toStrictEqual(["vite"]);
  });

  it("tests a template named twice once, in the order first named", () => {
    expect(
      templatesToTest(config, { templates: ["next", "vite", "next"] }),
    ).toStrictEqual(["next", "vite"]);
  });

  it("refuses an empty list and an unknown template from code", () => {
    expect(() => templatesToTest(config, { templates: [] })).toThrow(
      new InstallTestError("Name a template to test."),
    );
    expect(() =>
      templatesToTest(config, { templates: unchecked(["laravel"]) }),
    ).toThrow(
      new InstallTestError(
        'Unknown template "laravel"; use astro, next, react-router, start, vite.',
      ),
    );
  });
});
