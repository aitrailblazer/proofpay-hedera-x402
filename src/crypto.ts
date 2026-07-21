import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { canonicalJson, sha256 } from "./canonical.js";
import type { SealedArtifact } from "./types.js";

export interface ReceiptSigner {
  readonly publicKeyPem: string;
  readonly fingerprint: string;
  signCanonical(value: unknown): string;
  verifyCanonical(value: unknown, signature: string): boolean;
}

export const publicKeyFingerprint = (publicKeyPem: string): string =>
  sha256(
    createPublicKey(publicKeyPem).export({
      type: "spki",
      format: "der",
    }),
  );

export const createReceiptSigner = (privateKey: KeyObject): ReceiptSigner => {
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = publicKeyFingerprint(publicKeyPem);
  return {
    publicKeyPem,
    fingerprint,
    signCanonical(value: unknown): string {
      return sign(null, Buffer.from(canonicalJson(value)), privateKey).toString("base64");
    },
    verifyCanonical(value: unknown, signature: string): boolean {
      return verify(
        null,
        Buffer.from(canonicalJson(value)),
        publicKey,
        Buffer.from(signature, "base64"),
      );
    },
  };
};

export const generateReceiptSigner = (): ReceiptSigner => {
  const { privateKey } = generateKeyPairSync("ed25519");
  return createReceiptSigner(privateKey);
};

export const receiptSignerFromBase64Pem = (encoded: string): ReceiptSigner => {
  const pem = Buffer.from(encoded, "base64").toString("utf8");
  return createReceiptSigner(createPrivateKey(pem));
};

export const verifyCanonicalSignature = (
  value: unknown,
  signature: string,
  publicKeyPem: string,
): boolean =>
  verify(
    null,
    Buffer.from(canonicalJson(value)),
    createPublicKey(publicKeyPem),
    Buffer.from(signature, "base64"),
  );

export const sealArtifact = (
  plaintext: string,
  key = randomBytes(32),
): { sealed: SealedArtifact; decryptionKey: string } => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    sealed: {
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      auth_tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    },
    decryptionKey: key.toString("base64"),
  };
};

export const openArtifact = (sealed: SealedArtifact, decryptionKey: string): string => {
  if (sealed.algorithm !== "aes-256-gcm") {
    throw new Error(`unsupported seal algorithm: ${sealed.algorithm}`);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(decryptionKey, "base64"),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};
