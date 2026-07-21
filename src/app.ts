import {
  HTTPFacilitatorClient,
  x402ResourceServer,
  type RoutesConfig,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { paymentMiddleware } from "@x402/hono";
import { Hono } from "hono";
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
