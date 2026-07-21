import fixture from "../fixtures/mstr-2025-10k.json" with { type: "json" };
import { canonicalJson, sha256 } from "./canonical.js";
import type { EvidenceRequest, IssuerEvidence } from "./types.js";

const baseFixture = fixture as IssuerEvidence;

export interface EvidenceProvider {
  get(request: EvidenceRequest): Promise<IssuerEvidence>;
}

export const evidenceDigest = (evidence: IssuerEvidence): string =>
  sha256(
    canonicalJson({
      ticker: evidence.ticker,
      cik: evidence.cik,
      filing_form: evidence.filing_form,
      period: evidence.period,
      fundamentals: evidence.fundamentals,
      provenance: evidence.provenance,
    }),
  );

export class FixtureEvidenceProvider implements EvidenceProvider {
  async get(request: EvidenceRequest): Promise<IssuerEvidence> {
    const ticker = request.ticker.trim().toUpperCase();
    const period = request.period?.trim() || baseFixture.period;
    if (ticker !== baseFixture.ticker || period !== baseFixture.period) {
      throw new Error("unsupported_evidence_request");
    }
    const copy = structuredClone(baseFixture);
    const unhashed = structuredClone(copy);
    unhashed.provenance.source_snapshot_sha256 = "";
    copy.provenance.source_snapshot_sha256 = sha256(canonicalJson(unhashed));
    return copy;
  }
}
