import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyProofBundle } from "../src/receipt.js";
import type { ProofBundle } from "../src/types.js";

const path = process.argv[2];
if (!path) {
  throw new Error("Usage: npm run verify -- path/to/proof-bundle.json");
}
const bundle = JSON.parse(await readFile(resolve(path), "utf8")) as ProofBundle;
const trustedKeyPath = process.argv[3];
const trustedKeyBase64 = process.env.PROOFPAY_TRUSTED_PUBLIC_KEY_PEM_BASE64?.trim();
let trustedPublicKeyPem: string;
if (trustedKeyPath) {
  trustedPublicKeyPem = await readFile(resolve(trustedKeyPath), "utf8");
} else if (trustedKeyBase64) {
  trustedPublicKeyPem = Buffer.from(trustedKeyBase64, "base64").toString("utf8");
} else {
  const serverUrl = (
    process.env.PROOFPAY_SERVER_URL ?? "http://127.0.0.1:4021"
  ).replace(/\/+$/, "");
  const response = await fetch(`${serverUrl}/catalog`);
  if (!response.ok) {
    throw new Error(
      "A trusted key is required: pass a PEM path, set " +
        "PROOFPAY_TRUSTED_PUBLIC_KEY_PEM_BASE64, or run the ProofPay server",
    );
  }
  const catalog = (await response.json()) as {
    receipt_signer?: { public_key_pem?: string };
  };
  if (!catalog.receipt_signer?.public_key_pem) {
    throw new Error("ProofPay catalog did not publish a receipt verification key");
  }
  trustedPublicKeyPem = catalog.receipt_signer.public_key_pem;
}
const result = verifyProofBundle(bundle, trustedPublicKeyPem);

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
