import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSettlementReplayGuard } from "../src/replay.js";

const temporaryDirectories: string[] = [];

const ledgerPath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "proofpay-replay-"));
  temporaryDirectories.push(directory);
  return join(directory, "ledger.json");
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("persistent settlement replay guard", () => {
  it("rejects a transaction after process-like re-instantiation", async () => {
    const path = await ledgerPath();
    const first = new FileSettlementReplayGuard(path);
    expect(await first.claim("0.0.1-2-3")).toBe(true);

    const restarted = new FileSettlementReplayGuard(path);
    expect(await restarted.claim("0.0.1-2-3")).toBe(false);
    expect(await restarted.claim("0.0.1-2-4")).toBe(true);

    const ledger = JSON.parse(await readFile(path, "utf8")) as {
      transactions: string[];
    };
    expect(ledger.transactions).toEqual(["0.0.1-2-3", "0.0.1-2-4"]);
  });

  it("can release a reservation after a failed finalization", async () => {
    const path = await ledgerPath();
    const guard = new FileSettlementReplayGuard(path);
    expect(await guard.claim("0.0.1-2-3")).toBe(true);
    await guard.release("0.0.1-2-3");
    expect(await guard.claim("0.0.1-2-3")).toBe(true);
  });

  it("fails closed when the replay ledger is malformed", async () => {
    const path = await ledgerPath();
    await writeFile(path, '{"schema_id":"wrong","transactions":[]}\n');
    const guard = new FileSettlementReplayGuard(path);
    await expect(guard.claim("0.0.1-2-3")).rejects.toThrow(
      "settlement_replay_ledger_invalid",
    );
  });
});
