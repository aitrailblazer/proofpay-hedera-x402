export interface ServerConfig {
  hederaNetwork: string;
  facilitatorUrl: string;
  payToAccount: string;
  port: number;
  softwareCommit: string;
  receiptPrivateKeyBase64: string;
  publicBaseUrl: string;
  replayLedgerPath: string;
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const loadConfig = (): ServerConfig => {
  const hederaNetwork = process.env.HEDERA_NETWORK?.trim() || "hedera:testnet";
  if (hederaNetwork !== "hedera:testnet") {
    throw new Error("ProofPay bounty mode requires HEDERA_NETWORK=hedera:testnet");
  }
  const port = Number(process.env.PORT || "4021");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  return {
    hederaNetwork,
    facilitatorUrl: required("FACILITATOR_URL"),
    payToAccount: required("PAY_TO_ACCOUNT"),
    port,
    softwareCommit: process.env.PROOFPAY_SOFTWARE_COMMIT?.trim() || "development",
    receiptPrivateKeyBase64: required("PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64"),
    replayLedgerPath:
      process.env.PROOFPAY_REPLAY_LEDGER_PATH?.trim() ||
      ".data/settlement-replay-ledger.json",
    publicBaseUrl:
      process.env.PROOFPAY_SERVER_URL?.trim() || `http://127.0.0.1:${port}`,
  };
};
