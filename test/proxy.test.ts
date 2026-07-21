import { describe, expect, it } from "vitest";
import { normalizeForwardedRequest } from "../src/proxy.js";

describe("reverse proxy request normalization", () => {
  it("restores the public HTTPS scheme behind Azure Container Apps", () => {
    const request = new Request("http://proofpay.example/evidence/ppq_123", {
      headers: {
        "x-forwarded-proto": "https",
        "x-test": "preserved",
      },
    });

    const normalized = normalizeForwardedRequest(request);

    expect(normalized.url).toBe(
      "https://proofpay.example/evidence/ppq_123",
    );
    expect(normalized.headers.get("x-test")).toBe("preserved");
  });

  it("does not trust unrelated forwarded schemes", () => {
    const request = new Request("http://proofpay.example/health", {
      headers: { "x-forwarded-proto": "http" },
    });

    expect(normalizeForwardedRequest(request)).toBe(request);
  });
});
