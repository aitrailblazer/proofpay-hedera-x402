import { randomBytes, randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical.js";
import { sealArtifact, type ReceiptSigner } from "./crypto.js";
import { evidenceDigest, type EvidenceProvider } from "./evidence.js";
import {
  HBAR_ASSET_ID,
  PRODUCT_ID,
  PRODUCT_SCHEMA,
  type ArtifactAttestationPayload,
  type EvidenceRequest,
  type PaymentTerms,
  type Quote,
  type QuotePublicView,
  type SignedArtifactAttestation,
} from "./types.js";

export interface QuoteStoreOptions {
  network: string;
  payTo: string;
  publicBaseUrl: string;
  ttlMs?: number;
  baseAmountAtomic?: bigint;
  clock?: () => Date;
}

export class QuoteStore {
  readonly #quotes = new Map<string, Quote>();
  readonly #attestations = new Map<string, SignedArtifactAttestation>();
  readonly #provider: EvidenceProvider;
  readonly #signer: ReceiptSigner;
  readonly #options: Required<QuoteStoreOptions>;
  #counter = 0n;

  constructor(
    provider: EvidenceProvider,
    signer: ReceiptSigner,
    options: QuoteStoreOptions,
  ) {
    this.#provider = provider;
    this.#signer = signer;
    this.#options = {
      ttlMs: 180_000,
      baseAmountAtomic: 1_000_000n,
      clock: () => new Date(),
      ...options,
    };
  }

  async create(request: EvidenceRequest): Promise<QuotePublicView> {
    const normalizedRequest: EvidenceRequest = {
      ticker: request.ticker.trim().toUpperCase(),
      ...(request.period?.trim() ? { period: request.period.trim() } : {}),
    };
    const evidence = await this.#provider.get(normalizedRequest);
    const now = this.#options.clock();
    const expires = new Date(now.getTime() + this.#options.ttlMs);
    const quoteId = `ppq_${randomUUID().replaceAll("-", "")}`;
    const requestId = `ppr_${randomUUID().replaceAll("-", "")}`;
    const nonce = randomBytes(16).toString("hex");
    this.#counter = (this.#counter % 9_999n) + 1n;
    const paymentTerms: PaymentTerms = {
      scheme: "exact",
      network: this.#options.network,
      asset: HBAR_ASSET_ID,
      amount_atomic: (this.#options.baseAmountAtomic + this.#counter).toString(),
      pay_to: this.#options.payTo,
      max_timeout_seconds: Math.floor(this.#options.ttlMs / 1000),
    };
    const requestHash = sha256(canonicalJson(normalizedRequest));
    const evidenceHash = evidenceDigest(evidence);
    const plaintext = canonicalJson(evidence);
    const outputHash = sha256(plaintext);
    const { sealed, decryptionKey } = sealArtifact(plaintext);
    const sealedHash = sha256(canonicalJson(sealed));
    const paymentTermsHash = sha256(canonicalJson(paymentTerms));
    const quote: Quote = {
      quote_id: quoteId,
      request_id: requestId,
      nonce,
      product_id: PRODUCT_ID,
      request: normalizedRequest,
      request_hash: requestHash,
      evidence_hash: evidenceHash,
      output_hash: outputHash,
      sealed_hash: sealedHash,
      source_date: evidence.source_date,
      payment_terms: paymentTerms,
      payment_terms_hash: paymentTermsHash,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
      finalizing_at: null,
      consumed_at: null,
      evidence,
      sealed,
      decryption_key: decryptionKey,
    };
    const attestationPayload: ArtifactAttestationPayload = {
      schema_id: "proofpay.artifact-attestation.v1",
      quote_id: quote.quote_id,
      request_id: quote.request_id,
      nonce: quote.nonce,
      product_id: PRODUCT_ID,
      product_schema: PRODUCT_SCHEMA,
      request_hash: quote.request_hash,
      evidence_hash: quote.evidence_hash,
      output_hash: quote.output_hash,
      sealed_hash: quote.sealed_hash,
      source_date: quote.source_date,
      payment_terms_hash: quote.payment_terms_hash,
      issued_at: quote.created_at,
      expires_at: quote.expires_at,
      receipt_signer: this.#signer.fingerprint,
      signature_algorithm: "Ed25519",
    };
    this.#quotes.set(quote.quote_id, quote);
    this.#attestations.set(quote.quote_id, {
      payload: attestationPayload,
      signature: this.#signer.signCanonical(attestationPayload),
    });
    return this.publicView(quote);
  }

  publicView(quote: Quote): QuotePublicView {
    return {
      quote_id: quote.quote_id,
      request_id: quote.request_id,
      nonce: quote.nonce,
      product_id: PRODUCT_ID,
      request: quote.request,
      request_hash: quote.request_hash,
      source_date: quote.source_date,
      payment_terms: quote.payment_terms,
      payment_terms_hash: quote.payment_terms_hash,
      created_at: quote.created_at,
      expires_at: quote.expires_at,
      paid_resource_url: `${this.#options.publicBaseUrl}/evidence/${quote.quote_id}`,
    };
  }

  getActive(quoteId: string): Quote {
    const quote = this.#quotes.get(quoteId);
    if (!quote) {
      throw new Error("quote_not_found");
    }
    if (quote.consumed_at) {
      throw new Error("quote_consumed");
    }
    if (this.#options.clock().getTime() > Date.parse(quote.expires_at)) {
      throw new Error("quote_expired");
    }
    return quote;
  }

  attestation(quoteId: string): SignedArtifactAttestation {
    this.getActive(quoteId);
    const attestation = this.#attestations.get(quoteId);
    if (!attestation) {
      throw new Error("attestation_not_found");
    }
    return attestation;
  }

  beginFinalization(quoteId: string): Quote {
    const quote = this.getActive(quoteId);
    if (quote.finalizing_at) {
      throw new Error("quote_finalization_in_progress");
    }
    quote.finalizing_at = this.#options.clock().toISOString();
    return quote;
  }

  abortFinalization(quoteId: string): void {
    const quote = this.#quotes.get(quoteId);
    if (quote && !quote.consumed_at) {
      quote.finalizing_at = null;
    }
  }

  completeFinalization(quoteId: string): Quote {
    const quote = this.#quotes.get(quoteId);
    if (!quote || !quote.finalizing_at || quote.consumed_at) {
      throw new Error("quote_not_reserved");
    }
    quote.consumed_at = this.#options.clock().toISOString();
    quote.finalizing_at = null;
    return quote;
  }
}
