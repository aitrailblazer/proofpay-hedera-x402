import { describe, expect, it, vi } from "vitest";
import { HederaMirrorTransactionVerifier } from "../src/mirror.js";
import type { PaymentTerms, SettlementClaim } from "../src/types.js";

const terms: PaymentTerms = {
  scheme: "exact",
  network: "hedera:testnet",
  asset: "0.0.0",
  amount_atomic: "1000001",
  pay_to: "0.0.2222",
  max_timeout_seconds: 180,
};
const settlement: SettlementClaim = {
  success: true,
  transaction: "0.0.1111@1750000000.123456789",
  payer: "0.0.1111",
  network: "hedera:testnet",
};

const response = (overrides: Record<string, unknown> = {}): Response =>
  new Response(
    JSON.stringify({
      transactions: [
        {
          transaction_id: "0.0.1111-1750000000-123456789",
          consensus_timestamp: "1750000001.000000001",
          result: "SUCCESS",
          transfers: [
            { account: "0.0.1111", amount: -1000501 },
            { account: "0.0.2222", amount: 1000001 },
            { account: "0.0.3", amount: 500 },
          ],
          ...overrides,
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("Hedera mirror verification", () => {
  it("verifies transaction identity, result, seller credit, and payer debit", async () => {
    const fetchMock = vi.fn(async () => response());
    const verifier = new HederaMirrorTransactionVerifier(
      "https://mirror.example",
      fetchMock as typeof fetch,
    );
    const verified = await verifier.verify(settlement, terms);
    expect(verified).toMatchObject({
      transaction_id: "0.0.1111-1750000000-123456789",
      payer: "0.0.1111",
      pay_to: "0.0.2222",
      amount_atomic: "1000001",
      result: "SUCCESS",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("0.0.1111-1750000000-123456789"),
      expect.any(Object),
    );
  });

  it("rejects a transaction that credits the wrong amount", async () => {
    const fetchMock = vi.fn(async () =>
      response({
        transfers: [
          { account: "0.0.1111", amount: -1000500 },
          { account: "0.0.2222", amount: 1000000 },
        ],
      }),
    );
    const verifier = new HederaMirrorTransactionVerifier(
      "https://mirror.example",
      fetchMock as typeof fetch,
    );
    await expect(verifier.verify(settlement, terms)).rejects.toThrow(
      "mirror_pay_to_amount_mismatch",
    );
  });

  it("rejects a failed transaction and a false settlement claim", async () => {
    const failedFetch = vi.fn(async () => response({ result: "INSUFFICIENT_PAYER_BALANCE" }));
    const verifier = new HederaMirrorTransactionVerifier(
      "https://mirror.example",
      failedFetch as typeof fetch,
    );
    await expect(verifier.verify(settlement, terms)).rejects.toThrow(
      "mirror_transaction_insufficient_payer_balance",
    );
    await expect(
      verifier.verify({ ...settlement, success: false }, terms),
    ).rejects.toThrow("settlement_claim_unsuccessful");
  });

  it("retries while a newly settled transaction is not yet indexed", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(response());
    const verifier = new HederaMirrorTransactionVerifier(
      "https://mirror.example",
      fetchMock,
      { maxAttempts: 3, retryDelayMs: 0 },
    );

    await expect(verifier.verify(settlement, terms)).resolves.toMatchObject({
      result: "SUCCESS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
