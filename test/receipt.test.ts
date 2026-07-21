import { describe, expect, it } from "vitest";
import { generateReceiptSigner, openArtifact } from "../src/crypto.js";
import { FixtureEvidenceProvider } from "../src/evidence.js";
import type { TransactionVerifier } from "../src/mirror.js";
import { QuoteStore } from "../src/quotes.js";
import { ReceiptFinalizer, verifyProofBundle } from "../src/receipt.js";
import type {
  FinalizeResponse,
  ProofBundle,
  SettlementClaim,
  VerifiedTransaction,
} from "../src/types.js";

const settlement: SettlementClaim = {
  success: true,
  transaction: "0.0.1111-1750000000-123456789",
  payer: "0.0.1111",
  network: "hedera:testnet",
};

const harness = () => {
  const signer = generateReceiptSigner();
  const quotes = new QuoteStore(new FixtureEvidenceProvider(), signer, {
    network: "hedera:testnet",
    payTo: "0.0.2222",
    publicBaseUrl: "http://proofpay.example",
  });
  const transactions: TransactionVerifier = {
    async verify(claim, terms): Promise<VerifiedTransaction> {
      return {
        transaction_id: claim.transaction,
        consensus_timestamp: "1750000001.000000001",
        payer: claim.payer,
        pay_to: terms.pay_to,
        amount_atomic: terms.amount_atomic,
        network: terms.network,
        result: "SUCCESS",
      };
    },
  };
  const finalizer = new ReceiptFinalizer({
    quotes,
    signer,
    transactions,
    softwareCommit: "0123456789abcdef",
  });
  return { signer, quotes, finalizer };
};

const makeBundle = async (): Promise<{
  bundle: ProofBundle;
  finalized: FinalizeResponse;
}> => {
  const { signer, quotes, finalizer } = harness();
  const quote = await quotes.create({ ticker: "mstr", period: "2025-12-31" });
  const finalized = await finalizer.finalize({
    quote_id: quote.quote_id,
    attestation: quotes.attestation(quote.quote_id),
    settlement,
  });
  const bundle: ProofBundle = {
    ...finalized,
    artifact: JSON.parse(
      openArtifact(finalized.sealed, finalized.decryption_key),
    ) as ProofBundle["artifact"],
    quote,
    trusted_receipt_public_key: signer.publicKeyPem,
  };
  return { bundle, finalized };
};

describe("ProofPay receipt", () => {
  it("verifies a complete payment-to-artifact proof bundle", async () => {
    const { bundle } = await makeBundle();
    const result = verifyProofBundle(bundle, bundle.trusted_receipt_public_key);
    expect(result.ok).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
    expect(bundle.receipt.payload.hashscan_url).toContain(
      "hashscan.io/testnet/transaction/",
    );
  });

  it("detects tampered evidence, ciphertext, receipt, and decryption key", async () => {
    const evidenceTamper = structuredClone((await makeBundle()).bundle);
    evidenceTamper.artifact.fundamentals.revenue += 1;
    expect(
      verifyProofBundle(evidenceTamper, evidenceTamper.trusted_receipt_public_key).ok,
    ).toBe(false);

    const ciphertextTamper = structuredClone((await makeBundle()).bundle);
    const ciphertext = Buffer.from(ciphertextTamper.sealed.ciphertext, "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
    ciphertextTamper.sealed.ciphertext = ciphertext.toString("base64");
    expect(
      verifyProofBundle(ciphertextTamper, ciphertextTamper.trusted_receipt_public_key).ok,
    ).toBe(false);

    const receiptTamper = structuredClone((await makeBundle()).bundle);
    receiptTamper.receipt.payload.amount_atomic = "1";
    expect(
      verifyProofBundle(receiptTamper, receiptTamper.trusted_receipt_public_key).ok,
    ).toBe(false);

    const keyTamper = structuredClone((await makeBundle()).bundle);
    keyTamper.decryption_key = Buffer.alloc(32, 7).toString("base64");
    expect(
      verifyProofBundle(keyTamper, keyTamper.trusted_receipt_public_key).ok,
    ).toBe(false);
  });

  it("rejects quote replay and transaction replay", async () => {
    const { quotes, finalizer } = harness();
    const first = await quotes.create({ ticker: "MSTR" });
    await finalizer.finalize({
      quote_id: first.quote_id,
      attestation: quotes.attestation(first.quote_id),
      settlement,
    });
    await expect(
      finalizer.finalize({
        quote_id: first.quote_id,
        attestation: { payload: {} as never, signature: "invalid" },
        settlement,
      }),
    ).rejects.toThrow("quote_consumed");

    const second = await quotes.create({ ticker: "MSTR" });
    await expect(
      finalizer.finalize({
        quote_id: second.quote_id,
        attestation: quotes.attestation(second.quote_id),
        settlement,
      }),
    ).rejects.toThrow("settlement_transaction_replayed");
  });

  it("releases a quote reservation after failed verification", async () => {
    const { quotes, finalizer } = harness();
    const quote = await quotes.create({ ticker: "MSTR" });
    const bad = structuredClone(quotes.attestation(quote.quote_id));
    bad.payload.output_hash = "sha256:bad";
    await expect(
      finalizer.finalize({
        quote_id: quote.quote_id,
        attestation: bad,
        settlement,
      }),
    ).rejects.toThrow("artifact_attestation_invalid");
    expect(quotes.getActive(quote.quote_id).finalizing_at).toBeNull();
  });
});
