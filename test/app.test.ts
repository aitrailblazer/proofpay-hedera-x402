import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { generateReceiptSigner } from "../src/crypto.js";
import { FixtureEvidenceProvider } from "../src/evidence.js";
import type { TransactionVerifier } from "../src/mirror.js";
import { QuoteStore } from "../src/quotes.js";
import { ReceiptFinalizer } from "../src/receipt.js";

const makeApp = () => {
  const signer = generateReceiptSigner();
  const quotes = new QuoteStore(new FixtureEvidenceProvider(), signer, {
    network: "hedera:testnet",
    payTo: "0.0.2222",
    publicBaseUrl: "http://localhost:4021",
  });
  const transactions: TransactionVerifier = {
    async verify() {
      throw new Error("not_used");
    },
  };
  const finalizer = new ReceiptFinalizer({
    quotes,
    signer,
    transactions,
    softwareCommit: "test",
  });
  return createApp(
    {
      hederaNetwork: "hedera:testnet",
      payToAccount: "0.0.2222",
      facilitatorUrl: "https://facilitator.example",
      publicBaseUrl: "http://localhost:4021",
      syncFacilitatorOnStart: false,
    },
    { quotes, finalizer, signer },
  );
};

describe("ProofPay HTTP surface", () => {
  it("normalizes the public base URL so paid resource links are canonical", () => {
    const prior = { ...process.env };
    process.env.HEDERA_NETWORK = "hedera:testnet";
    process.env.FACILITATOR_URL = "https://facilitator.example";
    process.env.PAY_TO_ACCOUNT = "0.0.2222";
    process.env.PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64 = "placeholder";
    process.env.PROOFPAY_SERVER_URL = "https://proofpay.example/";
    expect(loadConfig().publicBaseUrl).toBe("https://proofpay.example");
    process.env = prior;
  });

  it("publishes agent discovery and a bounded OpenAPI document", async () => {
    const app = makeApp();
    const discoveryResponse = await app.request("/.well-known/proofpay");
    expect(discoveryResponse.status).toBe(200);
    const discovery = (await discoveryResponse.json()) as {
      network: string;
      pay_to: string;
      performed_payment_proof: { transaction_id: string };
    };
    expect(discovery).toMatchObject({
      network: "hedera:testnet",
      pay_to: "0.0.2222",
      performed_payment_proof: {
        transaction_id: "0.0.7162784-1784665192-906989595",
      },
    });

    const openAPIResponse = await app.request("/openapi.json");
    expect(openAPIResponse.status).toBe(200);
    const openAPI = (await openAPIResponse.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(openAPI.openapi).toBe("3.1.0");
    expect(openAPI.paths).toHaveProperty("/evidence/{quoteId}");
  });

  it("publishes health and the receipt verification key for free", async () => {
    const app = makeApp();
    expect((await app.request("/health")).status).toBe(200);
    const catalogResponse = await app.request("/catalog");
    const catalog = (await catalogResponse.json()) as {
      products: unknown[];
      receipt_signer: { public_key_pem: string; fingerprint: string };
    };
    expect(catalog.products).toHaveLength(1);
    expect(catalog.receipt_signer.public_key_pem).toContain("BEGIN PUBLIC KEY");
    expect(catalog.receipt_signer.fingerprint).toMatch(/^sha256:/);
  });

  it("creates a unique, bounded, single-use quote", async () => {
    const app = makeApp();
    const response = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "mstr", period: "2025-12-31" }),
    });
    expect(response.status).toBe(201);
    const quote = (await response.json()) as {
      quote_id: string;
      request: { ticker: string };
      payment_terms: { network: string; asset: string; amount_atomic: string };
      paid_resource_url: string;
    };
    expect(quote.quote_id).toMatch(/^ppq_/);
    expect(quote.request.ticker).toBe("MSTR");
    expect(quote.payment_terms).toMatchObject({
      network: "hedera:testnet",
      asset: "0.0.0",
    });
    expect(BigInt(quote.payment_terms.amount_atomic)).toBeGreaterThan(1_000_000n);
    expect(quote.paid_resource_url.endsWith(`/evidence/${quote.quote_id}`)).toBe(
      true,
    );
  });

  it("rejects invalid products before invoking payment middleware", async () => {
    const app = makeApp();
    const unsupported = await app.request("/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "FAKE" }),
    });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({
      error: "unsupported_evidence_request",
    });

    const missing = await app.request("/evidence/not-a-quote");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "quote_not_found" });
  });
});
