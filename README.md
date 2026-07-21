# ProofPay — Hedera x402 evidence receipts

ProofPay demonstrates an autonomous agent buying deterministic DeltaSignal-style
issuer evidence with HBAR on Hedera testnet. It extends a normal x402 payment
with a signed receipt that binds the transaction to the request, evidence,
delivered output, source date, and software version.

## What is different

HashScan proves that value moved. ProofPay additionally proves what the payment
unlocked. The server returns encrypted evidence after x402 settlement, verifies
the transaction against the Hedera mirror node, then releases the decryption
key and a signed Ed25519 receipt. The included verifier detects changed
evidence, receipts, ciphertext, keys, or transaction bindings.

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

## Evidence boundary

The bundled MSTR snapshot is deterministic, public-safe bounty-demo evidence
captured from a filing-backed DeltaSignal response. It is not live market data,
not investment advice, and not a representation that the fixture updates
automatically. Hedera packages currently carry upstream transitive security
advisories; review `npm audit` before production use.
