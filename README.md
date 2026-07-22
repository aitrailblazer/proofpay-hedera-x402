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

Watch or download the finished **3:43 captioned demo** from the
[`demo-v3` GitHub release](https://github.com/aitrailblazer/proofpay-hedera-x402/releases/tag/demo-v3).
The rendered video includes narration, burned-in captions, a branded opening
slide, the payer, seller, amount, consensus timestamp and transaction ID from
the performed Hedera testnet payment, verification and tamper evidence, and a
closing thank-you slide. The enhanced narration uses phrase-directed Apple
Samantha delivery, deliberate pauses, 48 kHz mastering, corrective EQ, gentle
compression, and EBU R128 loudness normalization. A plain-text
[`slide-by-slide transcript`](docs/ProofPay_Demo_Transcript.txt) documents every
on-screen beat and narration line.
The companion
[`slide-by-slide visualization prompts`](docs/ProofPay_Demo_Visualization_Prompts.txt)
specify the cinematic evidence layer, deterministic overlay boundary, motion
cues, negative prompts, branding, and provenance requirements for every slide.
For infographic production, use the
[`scene descriptions and infographic briefs`](docs/ProofPay_Demo_Infographic_Scene_Briefs.txt),
which define the story, diagram type, information hierarchy, composition,
exact overlay fields, and generation prompt for all eleven scenes.

### Visual storyboards

The eleven generated infographics below correspond one-to-one with the demo
scenes. Click any image to open the full 1024 × 1024 publication image. They
are explanatory storyboards; the exact transaction values and authoritative evidence remain in
the deterministic video overlays, proof bundle, mirror-node response, and
HashScan record. Each PNG carries truthful embedded provenance metadata and has
a matching receipt in [`img/provenance/`](img/provenance/manifest.json).

<table>
  <tr>
    <td width="50%" align="center">
      <a href="img/Scene01.jpg"><img src="img/Scene01.jpg" width="100%" alt="Scene 1 — ProofPay opening: autonomous request becomes verified evidence"></a>
      <br><strong>01 · ProofPay opening</strong><br>
      Agent request → Hedera settlement → verified evidence.
    </td>
    <td width="50%" align="center">
      <a href="img/Scene02.jpg"><img src="img/Scene02.jpg" width="100%" alt="Scene 2 — The payment-to-artifact verification gap"></a>
      <br><strong>02 · The missing link</strong><br>
      Cryptographically bind payment proof to delivered evidence.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="img/Scene03.jpg"><img src="img/Scene03.jpg" width="100%" alt="Scene 3 — End-to-end Hedera x402 architecture"></a>
      <br><strong>03 · End-to-end architecture</strong><br>
      Authorization, payment, verification, consensus, delivery, receipt.
    </td>
    <td width="50%" align="center">
      <a href="img/Scene04.jpg"><img src="img/Scene04.jpg" width="100%" alt="Scene 4 — Completed autonomous purchase role map"></a>
      <br><strong>04 · Completed purchase</strong><br>
      Value buyer, seller, facilitator fee payer, and Hedera consensus.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="img/Scene05.jpg"><img src="img/Scene05.jpg" width="100%" alt="Scene 5 — Hedera sponsored-fee settlement sequence"></a>
      <br><strong>05 · Sponsored-fee settlement</strong><br>
      Buyer authorization and facilitator fee sponsorship remain distinct.
    </td>
    <td width="50%" align="center">
      <a href="img/Scene06.jpg"><img src="img/Scene06.jpg" width="100%" alt="Scene 6 — Evidence unlock and signed receipt"></a>
      <br><strong>06 · Evidence unlock</strong><br>
      Mirror verification unlocks evidence and binds the receipt.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="img/Scene07.jpg"><img src="img/Scene07.jpg" width="100%" alt="Scene 7 — Public Hedera ledger and mirror-node proof"></a>
      <br><strong>07 · Public ledger proof</strong><br>
      Buyer, seller, fee payer, amount, result, and consensus.
    </td>
    <td width="50%" align="center">
      <a href="img/Scene08.jpg"><img src="img/Scene08.jpg" width="100%" alt="Scene 8 — Sixteen independent proof-bundle checks"></a>
      <br><strong>08 · Independent verification</strong><br>
      Sixteen receipt, hash, artifact, and settlement checks.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="img/Scene09.jpg"><img src="img/Scene09.jpg" width="100%" alt="Scene 9 — Fail-closed evidence tamper detection"></a>
      <br><strong>09 · Fail-closed integrity</strong><br>
      A one-field mutation breaks canonical and evidence hashes.
    </td>
    <td width="50%" align="center">
      <a href="img/Scene10.jpg"><img src="img/Scene10.jpg" width="100%" alt="Scene 10 — Durable DeltaSignal pay-per-evidence value"></a>
      <br><strong>10 · Durable DeltaSignal value</strong><br>
      Autonomous, auditable, composable pay-per-evidence delivery.
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="img/Scene11.jpg"><img src="img/Scene11.jpg" width="100%" alt="Scene 11 — Public source, performed settlement, and verifiable delivery"></a>
      <br><strong>11 · Public verification</strong><br>
      Repository, Hedera transaction, proof bundle, and signed receipt.
    </td>
    <td width="50%" valign="middle">
      <strong>Production references</strong><br><br>
      <a href="docs/ProofPay_Demo_Transcript.txt">Narration transcript</a><br>
      <a href="docs/ProofPay_Demo_Visualization_Prompts.txt">Visualization prompts</a><br>
      <a href="docs/ProofPay_Demo_Infographic_Scene_Briefs.txt">Infographic scene briefs</a><br>
      <a href="https://github.com/aitrailblazer/proofpay-hedera-x402/releases/tag/demo-v3">Captioned demo-v3 release</a>
    </td>
  </tr>
</table>

### Rebuild the enhanced Apple narration

On macOS, place the eleven deterministic `scene-00.png` through
`scene-10.png` frames in a frame directory, then run:

```bash
PROOFPAY_DEMO_FRAMES=artifacts/demo-video-v2 \
PROOFPAY_DEMO_OUTPUT=artifacts/demo-video-v3 \
npm run demo:video
```

The build reads phrase-level direction from
[`scripts/demo-video-script.json`](scripts/demo-video-script.json), renders
Apple Samantha locally at controlled rates, inserts deliberate pauses, masters
each scene to 48 kHz mono with corrective EQ and gentle compression, normalizes
to an EBU R128 target of -16 LUFS and -1.8 dBTP, retimes the SRT captions, and
renders the final captioned video. The reproducible implementation is
[`scripts/build-demo-video.ts`](scripts/build-demo-video.ts).

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
