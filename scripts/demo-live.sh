#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and add Hedera testnet credentials." >&2
  exit 1
fi

npm start &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in {1..30}; do
  if curl -fsS "${PROOFPAY_SERVER_URL:-http://127.0.0.1:4021}/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "${PROOFPAY_SERVER_URL:-http://127.0.0.1:4021}/health" >/dev/null
npm run buy
