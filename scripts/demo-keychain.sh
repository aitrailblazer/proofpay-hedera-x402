#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ACCOUNT="${USER:?USER is required}"

export HEDERA_NETWORK=hedera:testnet
export FACILITATOR_URL=https://api.testnet.blocky402.com
export HEDERA_CLIENT_ID
HEDERA_CLIENT_ID="$(security find-generic-password -a "$ACCOUNT" -s proofpay-hedera-client-id -w)"
export HEDERA_CLIENT_KEY
HEDERA_CLIENT_KEY="$(security find-generic-password -a "$ACCOUNT" -s proofpay-hedera-client-key -w)"
export PAY_TO_ACCOUNT
PAY_TO_ACCOUNT="$(security find-generic-password -a "$ACCOUNT" -s proofpay-hedera-pay-to-account -w)"
export PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64
PROOFPAY_RECEIPT_PRIVATE_KEY_PEM_BASE64="$(security find-generic-password -a "$ACCOUNT" -s proofpay-receipt-private-key-b64 -w)"
export PROOFPAY_SERVER_URL="${PROOFPAY_SERVER_URL:-http://127.0.0.1:4021}"
export PROOFPAY_SOFTWARE_COMMIT="${PROOFPAY_SOFTWARE_COMMIT:-$(git rev-parse HEAD)}"

exec bash scripts/demo-live.sh
