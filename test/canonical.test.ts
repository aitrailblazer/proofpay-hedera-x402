import { describe, expect, it } from "vitest";
import { canonicalJson, sha256 } from "../src/canonical.js";

describe("canonical JSON", () => {
  it("is stable across object insertion order", () => {
    const left = { z: 3, nested: { b: 2, a: 1 }, a: "first" };
    const right = { a: "first", nested: { a: 1, b: 2 }, z: 3 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(sha256(canonicalJson(left))).toBe(sha256(canonicalJson(right)));
  });

  it("preserves array order", () => {
    expect(canonicalJson({ values: [3, 1, 2] })).toBe('{"values":[3,1,2]}');
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-canonical value %s",
    (value) => {
      expect(() => canonicalJson({ value })).toThrow();
    },
  );
});
