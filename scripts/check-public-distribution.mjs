import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const findings = [];
const allowedArtifact = "artifacts/live-proof/.gitkeep";
const pinnedPublicEvidence = new Map([
  [
    "docs/evidence/proof-bundle-2026-07-21.json",
    "8f48bdb232c8c908dc39f334bd12f7d83aae74798a8b4f4d52beb253435c2342",
  ],
  [
    "docs/evidence/proofpay-receipt-public-key.pem",
    "f2778038c3224acdc32786396a648a217fc414059c78452c7ddede8e857bdebb",
  ],
]);
const forbiddenNames = [
  /(^|\/)\.env($|\.)/,
  /(^|\/)(id_rsa|id_ed25519)($|\.)/i,
  /\.(key|p12|pfx|keystore|jks)$/i,
  /(^|\/)(credentials?|secrets?|wallet)(\.|$)/i,
];
const contentRules = [
  {
    name: "private-key PEM block",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  },
  {
    name: "GitHub access token",
    pattern: /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  },
  {
    name: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "Azure storage connection string",
    pattern:
      /DefaultEndpointsProtocol=https?;AccountName=[^;\s]+;AccountKey=[^;\s]+/i,
  },
  {
    name: "populated Hedera private-key assignment",
    pattern:
      /HEDERA_(?:CLIENT|BUYER|SELLER)(?:_PRIVATE)?_KEY\s*=\s*["']?[0-9a-fA-F]{64,}/,
  },
  {
    name: "absolute macOS user path",
    pattern: /\/Users\/[^/\s"']+\//,
  },
];

for (const path of tracked) {
  if (!existsSync(path)) {
    continue;
  }
  if (lstatSync(path).isSymbolicLink()) {
    findings.push(`${path}: symbolic links are not allowed in the public tree`);
    continue;
  }
  if (path.startsWith("artifacts/") && path !== allowedArtifact) {
    findings.push(`${path}: generated artifact must not be tracked`);
  }

  if (
    path !== ".env.example" &&
    forbiddenNames.some((pattern) => pattern.test(path))
  ) {
    findings.push(`${path}: forbidden public filename`);
  }

  const stats = statSync(path);
  if (stats.size > 2_000_000 || stats.size === 0) {
    continue;
  }

  const content = readFileSync(path);
  const pinnedHash = pinnedPublicEvidence.get(path);
  if (
    pinnedHash !== undefined &&
    createHash("sha256").update(content).digest("hex") !== pinnedHash
  ) {
    findings.push(`${path}: pinned public-evidence hash changed`);
  }
  if (content.includes(0)) {
    continue;
  }
  const text = content.toString("utf8");
  for (const rule of contentRules) {
    if (rule.pattern.test(text)) {
      findings.push(`${path}: ${rule.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Public-distribution safety check failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  `Public-distribution safety check passed (${tracked.length} tracked files).`,
);
