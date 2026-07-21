#!/usr/bin/env bash
set -euo pipefail

ACCOUNT="${USER:?USER is required}"
read -r -p "Funded Hedera testnet buyer account ID: " BUYER_ID
read -r -p "Separate Hedera testnet seller account ID: " SELLER_ID
read -r -s -p "Buyer ECDSA private key (input hidden): " BUYER_KEY
printf '\n'

if [[ -z "$BUYER_ID" || -z "$SELLER_ID" || -z "$BUYER_KEY" ]]; then
  echo "All values are required." >&2
  exit 1
fi
if [[ "$BUYER_ID" == "$SELLER_ID" ]]; then
  echo "Buyer and seller must be different Hedera accounts." >&2
  exit 1
fi

RECEIPT_KEY="$(
  node --input-type=module -e '
    import {generateKeyPairSync} from "node:crypto";
    const {privateKey}=generateKeyPairSync("ed25519");
    const pem=privateKey.export({type:"pkcs8",format:"pem"});
    process.stdout.write(Buffer.from(pem).toString("base64"));
  '
)"

security add-generic-password -U -a "$ACCOUNT" -s proofpay-hedera-client-id -w "$BUYER_ID" >/dev/null
security add-generic-password -U -a "$ACCOUNT" -s proofpay-hedera-client-key -w "$BUYER_KEY" >/dev/null
security add-generic-password -U -a "$ACCOUNT" -s proofpay-hedera-pay-to-account -w "$SELLER_ID" >/dev/null
security add-generic-password -U -a "$ACCOUNT" -s proofpay-receipt-private-key-b64 -w "$RECEIPT_KEY" >/dev/null

unset BUYER_KEY RECEIPT_KEY
echo "Stored four ProofPay testnet values in macOS Keychain; no private key was printed."
