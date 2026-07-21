import { randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical.js";
import {
  openArtifact,
  publicKeyFingerprint,
  verifyCanonicalSignature,
  type ReceiptSigner,
} from "./crypto.js";
import { evidenceDigest } from "./evidence.js";
import type { TransactionVerifier } from "./mirror.js";
import type { QuoteStore } from "./quotes.js";
import {
  MemorySettlementReplayGuard,
  type SettlementReplayGuard,
} from "./replay.js";
import {
  HBAR_ASSET_ID,
  PRODUCT_ID,
  PRODUCT_SCHEMA,
  PROOFPAY_SCHEMA,
  type FinalizeRequest,
  type FinalizeResponse,
  type ProofBundle,
  type ProofPayReceiptPayload,
  type SignedArtifactAttestation,
  type SignedProofPayReceipt,
} from "./types.js";

const attestationMatchesQuote = (
  attestation: SignedArtifactAttestation,
  quote: ReturnType<QuoteStore["getActive"]>,
): boolean => {
  const payload = attestation.payload;
  return (
    payload.quote_id === quote.quote_id &&
    payload.request_id === quote.request_id &&
    payload.nonce === quote.nonce &&
    payload.request_hash === quote.request_hash &&
    payload.evidence_hash === quote.evidence_hash &&
    payload.output_hash === quote.output_hash &&
    payload.sealed_hash === quote.sealed_hash &&
    payload.payment_terms_hash === quote.payment_terms_hash &&
    payload.source_date === quote.source_date
  );
};

export class ReceiptFinalizer {
  readonly #quotes: QuoteStore;
  readonly #signer: ReceiptSigner;
  readonly #transactions: TransactionVerifier;
  readonly #softwareCommit: string;
  readonly #clock: () => Date;
  readonly #replayGuard: SettlementReplayGuard;

  constructor(options: {
    quotes: QuoteStore;
    signer: ReceiptSigner;
    transactions: TransactionVerifier;
    softwareCommit: string;
    replayGuard?: SettlementReplayGuard;
    clock?: () => Date;
  }) {
    this.#quotes = options.quotes;
    this.#signer = options.signer;
    this.#transactions = options.transactions;
    this.#softwareCommit = options.softwareCommit;
    this.#replayGuard =
      options.replayGuard ?? new MemorySettlementReplayGuard();
    this.#clock = options.clock ?? (() => new Date());
  }

  async finalize(request: FinalizeRequest): Promise<FinalizeResponse> {
    const quote = this.#quotes.beginFinalization(request.quote_id);
    let claimedTransactionId: string | undefined;
    try {
      if (
        !this.#signer.verifyCanonical(
          request.attestation.payload,
          request.attestation.signature,
        ) ||
        !attestationMatchesQuote(request.attestation, quote)
      ) {
        throw new Error("artifact_attestation_invalid");
      }
      const verified = await this.#transactions.verify(
        request.settlement,
        quote.payment_terms,
      );
      if (!(await this.#replayGuard.claim(verified.transaction_id))) {
        throw new Error("settlement_transaction_replayed");
      }
      claimedTransactionId = verified.transaction_id;
      const issuedAt = this.#clock().toISOString();
      const payload: ProofPayReceiptPayload = {
        schema_id: PROOFPAY_SCHEMA,
        receipt_id: `pprec_${randomUUID().replaceAll("-", "")}`,
        quote_id: quote.quote_id,
        request_id: quote.request_id,
        nonce: quote.nonce,
        product_id: PRODUCT_ID,
        product_schema: PRODUCT_SCHEMA,
        network: quote.payment_terms.network,
        asset: HBAR_ASSET_ID,
        amount_atomic: quote.payment_terms.amount_atomic,
        payer: verified.payer,
        pay_to: verified.pay_to,
        transaction_id: verified.transaction_id,
        hashscan_url: `https://hashscan.io/testnet/transaction/${encodeURIComponent(verified.transaction_id)}`,
        payment_terms_hash: quote.payment_terms_hash,
        request_hash: quote.request_hash,
        evidence_hash: quote.evidence_hash,
        output_hash: quote.output_hash,
        sealed_hash: quote.sealed_hash,
        source_date: quote.source_date,
        software_commit: this.#softwareCommit,
        settlement_verified: true,
        artifact_verified: true,
        settled_at: verified.consensus_timestamp,
        issued_at: issuedAt,
        receipt_signer: this.#signer.fingerprint,
        signature_algorithm: "Ed25519",
      };
      const receipt: SignedProofPayReceipt = {
        payload,
        signature: this.#signer.signCanonical(payload),
      };
      try {
        this.#quotes.completeFinalization(quote.quote_id);
        return {
          receipt,
          attestation: request.attestation,
          sealed: quote.sealed,
          decryption_key: quote.decryption_key,
        };
      } catch (error) {
        await this.#replayGuard.release(verified.transaction_id);
        claimedTransactionId = undefined;
        throw error;
      }
    } catch (error) {
      if (claimedTransactionId) {
        await this.#replayGuard.release(claimedTransactionId);
      }
      this.#quotes.abortFinalization(request.quote_id);
      throw error;
    }
  }
}

export interface VerificationResult {
  ok: boolean;
  checks: Record<string, boolean>;
  errors: string[];
}

export const verifyProofBundle = (
  bundle: ProofBundle,
  trustedPublicKeyPem: string,
): VerificationResult => {
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];
  const check = (name: string, value: boolean): void => {
    checks[name] = value;
    if (!value) errors.push(name);
  };

  check(
    "trusted_key_unchanged",
    bundle.trusted_receipt_public_key === trustedPublicKeyPem,
  );
  const trustedFingerprint = publicKeyFingerprint(trustedPublicKeyPem);
  check(
    "signer_identity",
    bundle.attestation.payload.receipt_signer === trustedFingerprint &&
      bundle.receipt.payload.receipt_signer === trustedFingerprint,
  );
  check(
    "attestation_signature",
    verifyCanonicalSignature(
      bundle.attestation.payload,
      bundle.attestation.signature,
      trustedPublicKeyPem,
    ),
  );
  check(
    "receipt_signature",
    verifyCanonicalSignature(
      bundle.receipt.payload,
      bundle.receipt.signature,
      trustedPublicKeyPem,
    ),
  );
  check(
    "quote_binding",
    bundle.receipt.payload.quote_id === bundle.attestation.payload.quote_id &&
      bundle.receipt.payload.request_id === bundle.attestation.payload.request_id &&
      bundle.receipt.payload.nonce === bundle.attestation.payload.nonce &&
      bundle.quote.quote_id === bundle.receipt.payload.quote_id &&
      bundle.quote.request_id === bundle.receipt.payload.request_id &&
      bundle.quote.nonce === bundle.receipt.payload.nonce,
  );
  check(
    "hash_binding",
    bundle.receipt.payload.request_hash === bundle.attestation.payload.request_hash &&
      bundle.receipt.payload.evidence_hash === bundle.attestation.payload.evidence_hash &&
      bundle.receipt.payload.output_hash === bundle.attestation.payload.output_hash &&
      bundle.receipt.payload.sealed_hash === bundle.attestation.payload.sealed_hash &&
      bundle.receipt.payload.payment_terms_hash ===
        bundle.attestation.payload.payment_terms_hash,
  );
  check("sealed_hash", sha256(canonicalJson(bundle.sealed)) === bundle.receipt.payload.sealed_hash);
  check(
    "request_hash",
    sha256(canonicalJson(bundle.quote.request)) === bundle.receipt.payload.request_hash,
  );
  check(
    "payment_terms_hash",
    sha256(canonicalJson(bundle.quote.payment_terms)) ===
      bundle.receipt.payload.payment_terms_hash,
  );
  check(
    "payment_terms",
    bundle.quote.payment_terms.network === bundle.receipt.payload.network &&
      bundle.quote.payment_terms.asset === bundle.receipt.payload.asset &&
      bundle.quote.payment_terms.amount_atomic === bundle.receipt.payload.amount_atomic &&
      bundle.quote.payment_terms.pay_to === bundle.receipt.payload.pay_to,
  );

  let plaintext = "";
  try {
    plaintext = openArtifact(bundle.sealed, bundle.decryption_key);
    check("sealed_artifact_decrypts", true);
  } catch {
    check("sealed_artifact_decrypts", false);
  }
  if (plaintext) {
    check("output_hash", sha256(plaintext) === bundle.receipt.payload.output_hash);
    check("artifact_canonical", plaintext === canonicalJson(bundle.artifact));
    check(
      "evidence_hash",
      evidenceDigest(bundle.artifact) === bundle.receipt.payload.evidence_hash,
    );
    check(
      "artifact_source_date",
      bundle.artifact.source_date === bundle.receipt.payload.source_date,
    );
  } else {
    check("output_hash", false);
    check("artifact_canonical", false);
    check("evidence_hash", false);
    check("artifact_source_date", false);
  }
  check(
    "settlement_claims",
    bundle.receipt.payload.schema_id === PROOFPAY_SCHEMA &&
      bundle.receipt.payload.network === "hedera:testnet" &&
      bundle.receipt.payload.asset === HBAR_ASSET_ID &&
      bundle.receipt.payload.settlement_verified === true &&
      bundle.receipt.payload.artifact_verified === true &&
      bundle.receipt.payload.transaction_id.length > 0,
  );
  return { ok: errors.length === 0, checks, errors };
};
