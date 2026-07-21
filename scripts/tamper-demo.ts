import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyProofBundle } from "../src/receipt.js";
import type { ProofBundle } from "../src/types.js";

const bundlePath = resolve(
  process.argv[2] ?? "docs/evidence/proof-bundle-2026-07-21.json",
);
const trustedKeyPath = resolve(
  process.argv[3] ?? "docs/evidence/proofpay-receipt-public-key.pem",
);
const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as ProofBundle;
const trustedPublicKey = await readFile(trustedKeyPath, "utf8");

const original = verifyProofBundle(bundle, trustedPublicKey);
if (!original.ok) {
  throw new Error(
    `Original bundle must verify before tampering: ${original.errors.join(", ")}`,
  );
}

const tampered = structuredClone(bundle);
tampered.artifact.ticker = "TAMPERED";
const result = verifyProofBundle(tampered, trustedPublicKey);
if (result.ok) {
  throw new Error("Tampered evidence unexpectedly passed verification");
}

console.log("Original bundle: PASS");
console.log("Tamper action: changed decrypted artifact ticker");
console.log(`Tampered bundle: REJECTED (${result.errors.join(", ")})`);
console.log("PASS: ProofPay detected evidence mutation.");
