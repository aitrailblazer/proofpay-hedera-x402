# ProofPay — Hedera x402 evidence receipts

ProofPay demonstrates an autonomous agent buying deterministic
[DeltaSignal ATLAS-7](https://aitrailblazer.github.io/deltasignal-atlas-codex-plugin/llms-full.txt)
issuer evidence with HBAR on Hedera testnet. It extends a normal x402 payment
with a signed receipt that binds the transaction to the request, evidence,
delivered output, source date, and software version.

## What is different

HashScan proves that value moved. ProofPay additionally proves what the payment
unlocked. The server returns encrypted evidence after x402 settlement, verifies
the transaction against the Hedera mirror node, then releases the decryption
key and a signed Ed25519 receipt. The included verifier detects changed
evidence, receipts, ciphertext, keys, or transaction bindings.

DeltaSignal's live public service already exposes compatibility-first Base x402
and an additive Circle Gateway lane. ProofPay is an isolated experiment showing
how Hedera can become another distribution rail without moving credentials,
wallet authority, or settlement logic into the DeltaSignal client. The bundled
MSTR fixture was captured from DeltaSignal's filing-backed fundamentals route
and retains its source endpoint, source date, quality flag, and snapshot hash.

## Quick start

Requirements: Node.js 20+, a funded Hedera testnet buyer account, a testnet
seller account, and an x402 Hedera facilitator.

```bash
npm install
npm run keygen
cp .env.example .env
# Add account IDs and secret values to .env; never commit it.
npm run check
npm start
```

In a second terminal:

```bash
npm run buy
npm run verify -- artifacts/live-proof/proof-bundle-....json
```

Or run the server and buyer together with `npm run demo:live`.

The buyer prints the real transaction ID and its
`https://hashscan.io/testnet/transaction/...` URL.

On macOS, avoid plaintext credential files:

```bash
npm run configure:keychain
npm run demo:keychain
```

The configuration prompt hides the ECDSA private-key input and stores the
buyer, separate seller, and receipt-signing values in macOS Keychain. Neither
script prints the private values.

For an Azure-hosted or Codex-operated demo, load the four credentials directly
from Azure Key Vault without writing a `.env` file:

```bash
az login
AZURE_KEY_VAULT_NAME=aitrailblazerkeyvault npm run demo:keyvault
```

The launcher reads `proofpay-hedera-buyer-account-id`,
`proofpay-hedera-buyer-private-key-hex`,
`proofpay-hedera-seller-account-id`, and
`proofpay-receipt-private-key-pem-base64`. The values are passed only through
the child-process environment and are never printed.

## Environment

See `.env.example`. `HEDERA_CLIENT_KEY` is required only by the buyer. The
server needs `PAY_TO_ACCOUNT`, `FACILITATOR_URL`, and a separately generated
receipt-signing key. Production deployments should load secrets from a secret
manager rather than a file. Offline verification must receive the trusted
receipt public key as the second argument; otherwise the verifier obtains it
from the running server rather than trusting a key embedded in the bundle.

## Demo flow (under five minutes)

1. Show `/catalog` and explain the artifact-binding gap (35 seconds).
2. Run `npm run buy`; point out the HTTP 402 and HBAR settlement (75 seconds).
3. Open the printed HashScan transaction (35 seconds).
4. Show the decrypted MSTR filing evidence and receipt hashes (45 seconds).
5. Run `npm run verify` and then a tamper test (45 seconds).
6. Close with the DeltaSignal pay-per-evidence use case (30 seconds).

Current submission evidence is tracked in
[`docs/ProofPay_Submission_Proof_Index.html`](docs/ProofPay_Submission_Proof_Index.html).
Use the interactive
[`ProofPay Demo Recording Console`](docs/ProofPay_Demo_Recording_Console.html)
for the timed, step-by-step under-five-minute recording workflow.

Watch or download the finished **2:57 captioned demo** from the
[`demo-v1` GitHub release](https://github.com/aitrailblazer/proofpay-hedera-x402/releases/tag/demo-v1).
The rendered video includes narration, burned-in captions, a branded opening
slide, the real Hedera transaction, verification and tamper evidence, and a
closing thank-you slide.

## Live Hedera testnet proof

- Transaction:
  [`0.0.7162784-1784665192-906989595`](https://hashscan.io/testnet/transaction/0.0.7162784-1784665192-906989595)
- Public proof bundle:
  [`docs/evidence/proof-bundle-2026-07-21.json`](docs/evidence/proof-bundle-2026-07-21.json)
- Bundle SHA-256:
  `8f48bdb232c8c908dc39f334bd12f7d83aae74798a8b4f4d52beb253435c2342`
- Live-proof CI:
  [GitHub Actions run 29865554201](https://github.com/aitrailblazer/proofpay-hedera-x402/actions/runs/29865554201)

The committed bundle contains public transaction, quote, receipt, ciphertext,
decryption, and deterministic evidence material only. It contains no wallet or
receipt-signing private key.

The DeltaSignal logo and visual identity used in the demo are
© 2026 DeltaSignal. All rights reserved. This notice asserts ownership in the
published artifact; it is not a representation of government registration.

Run the deterministic offline verifier and tamper demonstration with:

```bash
npm run verify -- docs/evidence/proof-bundle-2026-07-21.json docs/evidence/proofpay-receipt-public-key.pem
npm run demo:tamper
```

## Evidence boundary

The bundled MSTR snapshot is deterministic, public-safe bounty-demo evidence
captured from a filing-backed DeltaSignal response. It is not live market data,
not investment advice, and not a representation that the fixture updates
automatically. Hedera packages currently carry upstream transitive security
advisories; review `npm audit` before production use.
