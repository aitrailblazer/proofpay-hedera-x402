import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SettlementReplayGuard {
  claim(transactionId: string): Promise<boolean>;
  release(transactionId: string): Promise<void>;
}

export class MemorySettlementReplayGuard implements SettlementReplayGuard {
  readonly #transactions = new Set<string>();

  async claim(transactionId: string): Promise<boolean> {
    if (this.#transactions.has(transactionId)) return false;
    this.#transactions.add(transactionId);
    return true;
  }

  async release(transactionId: string): Promise<void> {
    this.#transactions.delete(transactionId);
  }
}

interface ReplayLedger {
  schema_id: "proofpay.settlement-replay-ledger.v1";
  transactions: string[];
}

export class FileSettlementReplayGuard implements SettlementReplayGuard {
  readonly #path: string;
  readonly #transactions = new Set<string>();
  #loaded = false;
  #queue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#queue;
    let release!: () => void;
    this.#queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async #load(): Promise<void> {
    if (this.#loaded) return;
    try {
      const ledger = JSON.parse(await readFile(this.#path, "utf8")) as ReplayLedger;
      if (
        ledger.schema_id !== "proofpay.settlement-replay-ledger.v1" ||
        !Array.isArray(ledger.transactions) ||
        ledger.transactions.some((value) => typeof value !== "string")
      ) {
        throw new Error("settlement_replay_ledger_invalid");
      }
      for (const transaction of ledger.transactions) {
        this.#transactions.add(transaction);
      }
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
    this.#loaded = true;
  }

  async #persist(): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const ledger: ReplayLedger = {
      schema_id: "proofpay.settlement-replay-ledger.v1",
      transactions: [...this.#transactions].sort(),
    };
    await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, this.#path);
  }

  async claim(transactionId: string): Promise<boolean> {
    return this.#exclusive(async () => {
      await this.#load();
      if (this.#transactions.has(transactionId)) return false;
      this.#transactions.add(transactionId);
      try {
        await this.#persist();
        return true;
      } catch (error) {
        this.#transactions.delete(transactionId);
        throw error;
      }
    });
  }

  async release(transactionId: string): Promise<void> {
    await this.#exclusive(async () => {
      await this.#load();
      if (!this.#transactions.delete(transactionId)) return;
      await this.#persist();
    });
  }
}
