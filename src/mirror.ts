import type {
  PaymentTerms,
  SettlementClaim,
  VerifiedTransaction,
} from "./types.js";

export interface TransactionVerifier {
  verify(
    settlement: SettlementClaim,
    terms: PaymentTerms,
  ): Promise<VerifiedTransaction>;
}

interface MirrorTransfer {
  account: string;
  amount: number;
}

interface MirrorTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  result: string;
  transfers: MirrorTransfer[];
}

interface MirrorResponse {
  transactions?: MirrorTransaction[];
}

const normalizedTransactionId = (value: string): string => {
  const trimmed = value.trim();
  const match = /^(\d+\.\d+\.\d+)[@-](\d+)[.-](\d+)$/.exec(trimmed);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : trimmed;
};

export class HederaMirrorTransactionVerifier implements TransactionVerifier {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #maxAttempts: number;
  readonly #retryDelayMs: number;

  constructor(
    baseUrl = "https://testnet.mirrornode.hedera.com",
    fetchImpl: typeof fetch = fetch,
    options: { maxAttempts?: number; retryDelayMs?: number } = {},
  ) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#fetch = fetchImpl;
    this.#maxAttempts = options.maxAttempts ?? 10;
    this.#retryDelayMs = options.retryDelayMs ?? 1_000;
  }

  async #lookup(id: string): Promise<MirrorTransaction> {
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      const response = await this.#fetch(
        `${this.#baseUrl}/api/v1/transactions/${encodeURIComponent(id)}`,
        { headers: { accept: "application/json" } },
      );
      const retryableStatus =
        response.status === 404 ||
        response.status === 429 ||
        response.status >= 500;
      if (response.ok) {
        const payload = (await response.json()) as MirrorResponse;
        const transaction = payload.transactions?.find(
          (candidate) =>
            normalizedTransactionId(candidate.transaction_id) === id,
        );
        if (transaction) return transaction;
        if (attempt === this.#maxAttempts) {
          throw new Error("mirror_transaction_not_found");
        }
      } else if (!retryableStatus || attempt === this.#maxAttempts) {
        throw new Error(`mirror_transaction_lookup_${response.status}`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.#retryDelayMs * attempt),
      );
    }
    throw new Error("mirror_transaction_not_found");
  }

  async verify(
    settlement: SettlementClaim,
    terms: PaymentTerms,
  ): Promise<VerifiedTransaction> {
    if (!settlement.success) {
      throw new Error("settlement_claim_unsuccessful");
    }
    if (settlement.network !== terms.network) {
      throw new Error("settlement_network_mismatch");
    }
    const id = normalizedTransactionId(settlement.transaction);
    if (!id) {
      throw new Error("settlement_transaction_missing");
    }
    const transaction = await this.#lookup(id);
    if (transaction.result !== "SUCCESS") {
      throw new Error(`mirror_transaction_${transaction.result.toLowerCase()}`);
    }
    if (
      transaction.transfers.some(
        (transfer) =>
          !Number.isSafeInteger(transfer.amount) || typeof transfer.account !== "string",
      )
    ) {
      throw new Error("mirror_transfer_invalid");
    }
    const paid = transaction.transfers
      .filter((transfer) => transfer.account === terms.pay_to && transfer.amount > 0)
      .reduce((total, transfer) => total + BigInt(transfer.amount), 0n);
    if (paid !== BigInt(terms.amount_atomic)) {
      throw new Error("mirror_pay_to_amount_mismatch");
    }
    const payerDebit = transaction.transfers
      .filter((transfer) => transfer.account === settlement.payer && transfer.amount < 0)
      .reduce((total, transfer) => total + BigInt(-transfer.amount), 0n);
    if (payerDebit < BigInt(terms.amount_atomic)) {
      throw new Error("mirror_payer_debit_mismatch");
    }
    return {
      transaction_id: transaction.transaction_id,
      consensus_timestamp: transaction.consensus_timestamp,
      payer: settlement.payer,
      pay_to: terms.pay_to,
      amount_atomic: terms.amount_atomic,
      network: terms.network,
      result: "SUCCESS",
    };
  }
}
