import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  createClientHederaSigner,
  PrivateKey as HederaPrivateKey,
} from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { openArtifact } from "../src/crypto.js";
import { verifyProofBundle } from "../src/receipt.js";
import type {
  FinalizeResponse,
  IssuerEvidence,
  PaidArtifactEnvelope,
  ProofBundle,
  QuotePublicView,
  SettlementClaim,
} from "../src/types.js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const readJson = async <T>(response: Response): Promise<T> => {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
  return JSON.parse(body) as T;
};

const accountId = required("HEDERA_CLIENT_ID");
const privateKeyText = required("HEDERA_CLIENT_KEY");
const serverUrl = (process.env.PROOFPAY_SERVER_URL ?? "http://127.0.0.1:4021").replace(
  /\/+$/,
  "",
);
const keyType = (process.env.HEDERA_KEY_TYPE ?? "ECDSA").toUpperCase();
const outputPath = resolve(
  process.env.PROOFPAY_BUNDLE_PATH ??
    `artifacts/live-proof/proof-bundle-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`,
);
const privateKey =
  keyType === "ED25519"
    ? HederaPrivateKey.fromStringED25519(privateKeyText)
    : HederaPrivateKey.fromStringECDSA(privateKeyText);
const hederaSigner = createClientHederaSigner(accountId, privateKey, {
  network: "hedera:testnet",
});
const paymentClient = new x402Client().register(
  "hedera:*",
  new ExactHederaScheme(hederaSigner),
);
const fetchWithPayment = wrapFetchWithPayment(fetch, paymentClient);
const httpClient = new x402HTTPClient(paymentClient);

console.log("1/5 Discovering ProofPay catalog");
const catalog = await readJson<{
  receipt_signer: { public_key_pem: string; fingerprint: string };
}>(await fetch(`${serverUrl}/catalog`));

console.log("2/5 Creating a single-use MSTR evidence quote");
const quote = await readJson<QuotePublicView>(
  await fetch(`${serverUrl}/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: "MSTR", period: "2025-12-31" }),
  }),
);
console.log(
  `    quote=${quote.quote_id} amount=${quote.payment_terms.amount_atomic} tinybar`,
);

console.log("3/5 Paying HTTP 402 on Hedera testnet");
const paidResponse = await fetchWithPayment(quote.paid_resource_url);
const envelope = await readJson<PaidArtifactEnvelope>(paidResponse);
const settlement = httpClient.getPaymentSettleResponse((name) =>
  paidResponse.headers.get(name),
);
if (
  !settlement ||
  !settlement.success ||
  !settlement.transaction ||
  !settlement.payer
) {
  throw new Error("Paid response did not contain a successful settlement receipt");
}
const settlementClaim: SettlementClaim = {
  success: settlement.success,
  transaction: settlement.transaction,
  network: "hedera:testnet",
  payer: settlement.payer,
};
console.log(`    transaction=${settlement.transaction}`);

console.log("4/5 Mirror-verifying settlement and unlocking the evidence");
const finalized = await readJson<FinalizeResponse>(
  await fetch(envelope.finalize_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quote_id: quote.quote_id,
      attestation: envelope.attestation,
      settlement: settlementClaim,
    }),
  }),
);
const artifact = JSON.parse(
  openArtifact(finalized.sealed, finalized.decryption_key),
) as IssuerEvidence;
const bundle: ProofBundle = {
  ...finalized,
  artifact,
  quote,
  trusted_receipt_public_key: catalog.receipt_signer.public_key_pem,
};

console.log("5/5 Independently verifying and writing the proof bundle");
const verification = verifyProofBundle(
  bundle,
  catalog.receipt_signer.public_key_pem,
);
if (!verification.ok) {
  throw new Error(`Proof verification failed: ${verification.errors.join(", ")}`);
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, {
  mode: 0o600,
});
console.log(`    HashScan: ${bundle.receipt.payload.hashscan_url}`);
console.log(`    Evidence: ${artifact.ticker} ${artifact.filing_form} ${artifact.period}`);
console.log(`    Proof bundle: ${outputPath}`);
console.log("PASS: payment, delivery, provenance, and signatures are bound.");
