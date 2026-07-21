export const PROOFPAY_SCHEMA = "proofpay.receipt.v1";
export const PRODUCT_ID = "issuer-filing-evidence-v1";
export const PRODUCT_SCHEMA = "issuer-filing-evidence.v1";
export const HBAR_ASSET_ID = "0.0.0";

export interface EvidenceRequest {
  ticker: string;
  period?: string;
}

export interface IssuerEvidence {
  schema_id: typeof PRODUCT_SCHEMA;
  ticker: string;
  cik: string;
  entity_name: string;
  filing_form: string;
  period: string;
  source_date: string;
  retrieved_at: string;
  fundamentals: {
    cash_and_equivalents: number;
    cash_flow_from_operations: number;
    current_assets: number;
    net_income: number;
    operating_income: number;
    revenue: number;
    total_assets: number;
    total_equity: number;
    total_liabilities: number;
  };
  provenance: {
    data_source: string;
    is_linkbase_backed: boolean;
    quality_flag: string;
    root_resolution_method: string;
    source_endpoint: string;
    source_snapshot_sha256: string;
  };
  evidence_boundary: string[];
}

export interface PaymentTerms {
  scheme: "exact";
  network: string;
  asset: typeof HBAR_ASSET_ID;
  amount_atomic: string;
  pay_to: string;
  max_timeout_seconds: number;
}

export interface Quote {
  quote_id: string;
  request_id: string;
  nonce: string;
  product_id: typeof PRODUCT_ID;
  request: EvidenceRequest;
  request_hash: string;
  evidence_hash: string;
  output_hash: string;
  sealed_hash: string;
  source_date: string;
  payment_terms: PaymentTerms;
  payment_terms_hash: string;
  created_at: string;
  expires_at: string;
  finalizing_at: string | null;
  consumed_at: string | null;
  evidence: IssuerEvidence;
  sealed: SealedArtifact;
  decryption_key: string;
}

export interface SealedArtifact {
  algorithm: "aes-256-gcm";
  iv: string;
  auth_tag: string;
  ciphertext: string;
}

export interface ArtifactAttestationPayload {
  schema_id: "proofpay.artifact-attestation.v1";
  quote_id: string;
  request_id: string;
  nonce: string;
  product_id: typeof PRODUCT_ID;
  product_schema: typeof PRODUCT_SCHEMA;
  request_hash: string;
  evidence_hash: string;
  output_hash: string;
  sealed_hash: string;
  source_date: string;
  payment_terms_hash: string;
  issued_at: string;
  expires_at: string;
  receipt_signer: string;
  signature_algorithm: "Ed25519";
}

export interface SignedArtifactAttestation {
  payload: ArtifactAttestationPayload;
  signature: string;
}

export interface SettlementClaim {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
}

export interface VerifiedTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  payer: string;
  pay_to: string;
  amount_atomic: string;
  network: string;
  result: "SUCCESS";
}

export interface ProofPayReceiptPayload {
  schema_id: typeof PROOFPAY_SCHEMA;
  receipt_id: string;
  quote_id: string;
  request_id: string;
  nonce: string;
  product_id: typeof PRODUCT_ID;
  product_schema: typeof PRODUCT_SCHEMA;
  network: string;
  asset: typeof HBAR_ASSET_ID;
  amount_atomic: string;
  payer: string;
  pay_to: string;
  transaction_id: string;
  hashscan_url: string;
  payment_terms_hash: string;
  request_hash: string;
  evidence_hash: string;
  output_hash: string;
  sealed_hash: string;
  source_date: string;
  software_commit: string;
  settlement_verified: true;
  artifact_verified: true;
  settled_at: string;
  issued_at: string;
  receipt_signer: string;
  signature_algorithm: "Ed25519";
}

export interface SignedProofPayReceipt {
  payload: ProofPayReceiptPayload;
  signature: string;
}

export interface FinalizeRequest {
  quote_id: string;
  attestation: SignedArtifactAttestation;
  settlement: SettlementClaim;
}

export interface FinalizeResponse {
  receipt: SignedProofPayReceipt;
  attestation: SignedArtifactAttestation;
  sealed: SealedArtifact;
  decryption_key: string;
}

export interface ProofBundle extends FinalizeResponse {
  artifact: IssuerEvidence;
  quote: QuotePublicView;
  trusted_receipt_public_key: string;
}

export interface QuotePublicView {
  quote_id: string;
  request_id: string;
  nonce: string;
  product_id: typeof PRODUCT_ID;
  request: EvidenceRequest;
  request_hash: string;
  source_date: string;
  payment_terms: PaymentTerms;
  payment_terms_hash: string;
  created_at: string;
  expires_at: string;
  paid_resource_url: string;
}

export interface PaidArtifactEnvelope {
  schema_id: "proofpay.sealed-artifact.v1";
  quote_id: string;
  attestation: SignedArtifactAttestation;
  sealed: SealedArtifact;
  finalize_url: string;
  evidence_boundary: string[];
}
