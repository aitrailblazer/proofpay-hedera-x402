import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { receiptSignerFromBase64Pem } from "./crypto.js";
import { FixtureEvidenceProvider } from "./evidence.js";
import { HederaMirrorTransactionVerifier } from "./mirror.js";
import { normalizeForwardedRequest } from "./proxy.js";
import { QuoteStore } from "./quotes.js";
import { ReceiptFinalizer } from "./receipt.js";
import { FileSettlementReplayGuard } from "./replay.js";

const config = loadConfig();
const signer = receiptSignerFromBase64Pem(config.receiptPrivateKeyBase64);
const quotes = new QuoteStore(new FixtureEvidenceProvider(), signer, {
  network: config.hederaNetwork,
  payTo: config.payToAccount,
  publicBaseUrl: config.publicBaseUrl,
});
const finalizer = new ReceiptFinalizer({
  quotes,
  signer,
  transactions: new HederaMirrorTransactionVerifier(),
  softwareCommit: config.softwareCommit,
  replayGuard: new FileSettlementReplayGuard(config.replayLedgerPath),
});
const app = createApp(config, { quotes, finalizer, signer });

serve(
  {
    fetch: (request) => app.fetch(normalizeForwardedRequest(request)),
    port: config.port,
  },
  ({ port }) => {
  console.log(`ProofPay Hedera x402 listening on ${config.publicBaseUrl} (port ${port})`);
  console.log(`Receipt signer: ${signer.fingerprint}`);
  },
);
