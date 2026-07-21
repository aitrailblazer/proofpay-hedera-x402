import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

console.log("# Store the private value in a secret manager; never commit it.");
console.log(`PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64=${Buffer.from(privatePem).toString("base64")}`);
console.log("\n# Publish this verification key:");
console.log(publicPem);
