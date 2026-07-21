import { createHash } from "node:crypto";

const normalize = (value: unknown): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON rejects non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => {
          const child = object[key];
          if (child === undefined) {
            throw new TypeError(`canonical JSON rejects undefined at ${key}`);
          }
          return [key, normalize(child)];
        }),
    );
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
};

export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value));

export const sha256 = (value: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
