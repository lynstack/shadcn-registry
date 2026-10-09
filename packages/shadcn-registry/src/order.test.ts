import { describe, expect, it } from "vitest";

import { compareText, sorted } from "./order.ts";

describe("order", () => {
  it("orders by code unit, not by the alphabet of a locale", () => {
    expect(
      ["hover", "dialog", "checkbox", "ab", "aa-x", "B.ts", "a.ts"].toSorted(
        compareText,
      ),
    ).toStrictEqual([
      "B.ts",
      "a.ts",
      "aa-x",
      "ab",
      "checkbox",
      "dialog",
      "hover",
    ]);
  });

  it("keeps each value once", () => {
    expect(sorted(["b", "a", "b"])).toStrictEqual(["a", "b"]);
  });
});
