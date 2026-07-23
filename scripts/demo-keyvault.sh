#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VAULT_NAME="${AZURE_KEY_VAULT_NAME:-}"

if [[ -z "$VAULT_NAME" ]]; then
  echo "Set AZURE_KEY_VAULT_NAME to your Key Vault resource name." >&2
  exit 1
fi

command -v az >/dev/null 2>&1 || {
  echo "Azure CLI is required for the Key Vault demo." >&2
  exit 1
}

read_secret() {
  az keyvault secret show \
    --vault-name "$VAULT_NAME" \
    --name "$1" \
    --query value \
    --output tsv
}

export HEDERA_NETWORK=hedera:testnet
export FACILITATOR_URL=https://api.testnet.blocky402.com
export HEDERA_KEY_TYPE=ECDSA
export HEDERA_CLIENT_ID
HEDERA_CLIENT_ID="$(read_secret proofpay-hedera-buyer-account-id)"
export HEDERA_CLIENT_KEY
HEDERA_CLIENT_KEY="$(read_secret proofpay-hedera-buyer-private-key-hex)"
export PAY_TO_ACCOUNT
PAY_TO_ACCOUNT="$(read_secret proofpay-hedera-seller-account-id)"
export PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64
PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64="$(
  read_secret proofpay-receipt-private-key-pem-base64
)"
export PROOFPAY_SERVER_URL="${PROOFPAY_SERVER_URL:-http://127.0.0.1:4021}"
export PROOFPAY_SOFTWARE_COMMIT="${PROOFPAY_SOFTWARE_COMMIT:-$(git rev-parse HEAD)}"

exec bash scripts/demo-live.sh
