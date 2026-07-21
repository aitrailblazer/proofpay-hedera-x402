import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type RoutesConfig,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { paymentMiddleware } from "@x402/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ReceiptSigner } from "./crypto.js";
import type { ReceiptFinalizer } from "./receipt.js";
import type { QuoteStore } from "./quotes.js";
import {
  HBAR_ASSET_ID,
  PRODUCT_ID,
  PRODUCT_SCHEMA,
  type EvidenceRequest,
  type FinalizeRequest,
  type PaidArtifactEnvelope,
} from "./types.js";

export interface AppConfig {
  hederaNetwork: string;
  payToAccount: string;
  facilitatorUrl: string;
  publicBaseUrl: string;
  syncFacilitatorOnStart?: boolean;
}

export interface AppDependencies {
  quotes: QuoteStore;
  finalizer: ReceiptFinalizer;
  signer: ReceiptSigner;
}

const errorStatus = (message: string): 400 | 404 | 409 | 410 | 500 => {
  if (message === "quote_not_found") return 404;
  if (message === "quote_expired") return 410;
  if (
    message === "quote_consumed" ||
    message === "quote_finalization_in_progress" ||
    message === "quote_not_reserved"
  ) {
    return 409;
  }
  if (
    message.startsWith("unsupported_") ||
    message.endsWith("_invalid") ||
    message.endsWith("_mismatch") ||
    message.startsWith("settlement_") ||
    message.startsWith("transaction_")
  ) {
    return 400;
  }
  return 500;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown_error";

const parseEvidenceRequest = (value: unknown): EvidenceRequest => {
  if (!value || typeof value !== "object") throw new Error("request_invalid");
  const ticker = Reflect.get(value, "ticker");
  const period = Reflect.get(value, "period");
  if (typeof ticker !== "string" || !ticker.trim()) {
    throw new Error("request_invalid");
  }
  if (period !== undefined && typeof period !== "string") {
    throw new Error("request_invalid");
  }
  return {
    ticker,
    ...(period === undefined ? {} : { period }),
  };
};

const parseFinalizeRequest = (value: unknown): FinalizeRequest => {
  if (!value || typeof value !== "object") throw new Error("finalize_request_invalid");
  const quoteId = Reflect.get(value, "quote_id");
  const attestation = Reflect.get(value, "attestation");
  const settlement = Reflect.get(value, "settlement");
  if (
    typeof quoteId !== "string" ||
    !attestation ||
    typeof attestation !== "object" ||
    !settlement ||
    typeof settlement !== "object"
  ) {
    throw new Error("finalize_request_invalid");
  }
  return value as FinalizeRequest;
};

export const createApp = (
  config: AppConfig,
  dependencies: AppDependencies,
): Hono => {
  const { quotes, finalizer, signer } = dependencies;
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      exposeHeaders: ["PAYMENT-RESPONSE"],
      maxAge: 86400,
    }),
  );
  const x402Server = new x402ResourceServer(
    new HTTPFacilitatorClient({ url: config.facilitatorUrl }),
  ).register("hedera:*", new ExactHederaScheme());

  const routes: RoutesConfig = {
    "GET /evidence/:quoteId": {
      description:
        "Sealed, filing-backed issuer evidence with a signed artifact attestation",
      accepts: {
        scheme: "exact",
        network: config.hederaNetwork as Network,
        payTo: config.payToAccount,
        price: (context) => {
          const quoteId = context.path.split("/").filter(Boolean).at(-1) ?? "";
          const quote = quotes.getActive(quoteId);
          return {
            amount: quote.payment_terms.amount_atomic,
            asset: quote.payment_terms.asset,
          };
        },
        maxTimeoutSeconds: 180,
      },
    },
  };

  app.onError((error, context) => {
    const message = messageOf(error);
    const status = errorStatus(message);
    if (status === 500) console.error(error);
    return context.json({ error: message }, status);
  });

  app.get("/", (context) =>
    context.json({
      schema_id: "proofpay.discovery.v1",
      service: "ProofPay for DeltaSignal",
      description:
        "Hedera x402 testnet evidence delivery with independently verifiable payment-to-artifact receipts.",
      status: "public_testnet_preview",
      network: config.hederaNetwork,
      endpoints: {
        health: `${config.publicBaseUrl}/health`,
        catalog: `${config.publicBaseUrl}/catalog`,
        create_quote: `${config.publicBaseUrl}/quotes`,
        openapi: `${config.publicBaseUrl}/openapi.json`,
        discovery: `${config.publicBaseUrl}/.well-known/proofpay`,
      },
      public_source: "https://github.com/aitrailblazer/proofpay-hedera-x402",
      usage_guide:
        "https://aitrailblazer.github.io/deltasignal-atlas-codex-plugin/#hedera-proofpay",
      boundaries: [
        "Hedera testnet only",
        "No new payment occurs until a buyer signs and retries an HTTP 402 challenge",
        "No investment advice or trade execution",
      ],
    }),
  );

  app.get("/.well-known/proofpay", (context) =>
    context.json({
      schema_id: "proofpay.well-known.v1",
      service: "ProofPay for DeltaSignal",
      status: "public_testnet_preview",
      protocol: "x402",
      scheme: "exact",
      network: config.hederaNetwork,
      asset: HBAR_ASSET_ID,
      pay_to: config.payToAccount,
      quote_endpoint: `${config.publicBaseUrl}/quotes`,
      paid_resource_template: `${config.publicBaseUrl}/evidence/{quote_id}`,
      receipt_finalize_endpoint: `${config.publicBaseUrl}/receipts/finalize`,
      receipt_algorithm: "Ed25519",
      delivery_encryption: "AES-256-GCM",
      source_repository:
        "https://github.com/aitrailblazer/proofpay-hedera-x402",
      performed_payment_proof: {
        transaction_id: "0.0.7162784-1784665192-906989595",
        hashscan_url:
          "https://hashscan.io/testnet/transaction/0.0.7162784-1784665192-906989595",
        proof_bundle:
          "https://github.com/aitrailblazer/proofpay-hedera-x402/blob/main/docs/evidence/proof-bundle-2026-07-21.json",
      },
      boundaries: [
        "The performed-payment proof documents a prior completed testnet run",
        "Creating a quote does not move funds",
        "The buyer controls whether to sign and submit a payment",
      ],
    }),
  );

  app.get("/openapi.json", (context) =>
    context.json({
      openapi: "3.1.0",
      info: {
        title: "ProofPay for DeltaSignal",
        version: "0.2.0",
        description:
          "Hedera x402 testnet evidence delivery and signed receipt API.",
      },
      servers: [{ url: config.publicBaseUrl }],
      paths: {
        "/health": { get: { summary: "Service health" } },
        "/catalog": { get: { summary: "Free evidence product catalog" } },
        "/quotes": {
          post: {
            summary: "Create a bounded single-use evidence quote",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ticker"],
                    properties: {
                      ticker: { type: "string", example: "MSTR" },
                      period: {
                        type: "string",
                        example: "2025-12-31",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/evidence/{quoteId}": {
          get: {
            summary: "x402-protected sealed evidence resource",
            responses: {
              "200": { description: "Paid sealed evidence envelope" },
              "402": { description: "Hedera x402 payment required" },
            },
          },
        },
        "/receipts/finalize": {
          post: {
            summary:
              "Mirror-verify settlement and release the signed delivery receipt",
          },
        },
      },
    }),
  );

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "proofpay-hedera-x402",
      network: config.hederaNetwork,
      receipt_signer: signer.fingerprint,
    }),
  );

  app.get("/catalog", (context) =>
    context.json({
      products: [
        {
          id: PRODUCT_ID,
          schema_id: PRODUCT_SCHEMA,
          description:
            "Deterministic SEC filing evidence sealed until Hedera settlement is mirror-verified",
          network: config.hederaNetwork,
          asset: HBAR_ASSET_ID,
          base_price_atomic: "1000000",
          quote_required: true,
        },
      ],
      receipt_signer: {
        algorithm: "Ed25519",
        fingerprint: signer.fingerprint,
        public_key_pem: signer.publicKeyPem,
      },
      boundaries: [
        "Hedera testnet only",
        "Evidence is deterministic fixture data for the bounty demo",
        "No trade recommendation or investment advice",
      ],
    }),
  );

  app.post("/quotes", async (context) => {
    const request = parseEvidenceRequest(await context.req.json());
    return context.json(await quotes.create(request), 201);
  });

  app.use("/evidence/:quoteId", async (context, next) => {
    quotes.getActive(context.req.param("quoteId"));
    await next();
  });
  app.use(
    "*",
    paymentMiddleware(
      routes,
      x402Server,
      undefined,
      undefined,
      config.syncFacilitatorOnStart ?? true,
    ),
  );

  app.get("/evidence/:quoteId", (context) => {
    const quoteId = context.req.param("quoteId");
    const quote = quotes.getActive(quoteId);
    const envelope: PaidArtifactEnvelope = {
      schema_id: "proofpay.sealed-artifact.v1",
      quote_id: quoteId,
      attestation: quotes.attestation(quoteId),
      sealed: quote.sealed,
      finalize_url: `${config.publicBaseUrl}/receipts/finalize`,
      evidence_boundary: [
        "The decryption key is released only after mirror-node verification",
        "The final receipt binds payment, request, evidence, output, and software version",
      ],
    };
    return context.json(envelope);
  });

  app.post("/receipts/finalize", async (context) => {
    const request = parseFinalizeRequest(await context.req.json());
    return context.json(await finalizer.finalize(request), 201);
  });

  return app;
};
