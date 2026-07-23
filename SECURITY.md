# Security policy

## Supported scope

ProofPay is a public Hedera **testnet** reference implementation. It is not
approved for mainnet custody or production payment processing.

The current `main` branch is the supported code line. The published proof
bundle is intentionally self-contained and includes decryption material for a
public-safe demonstration artifact; it contains no wallet or receipt-signing
private key.

## Secret handling

- Never commit `.env` files, wallet keys, seed phrases, bearer tokens, or
  receipt-signing private keys.
- The buyer key belongs to the paying client and must not be deployed with the
  resource server.
- Use a local secret manager, macOS Keychain, or Azure Key Vault.
- Rotate any credential immediately if it appears in logs, screenshots,
  commits, CI output, or issue attachments.
- Run `npm run check:public` before publishing.

## Reporting

Do not open a public issue for a suspected vulnerability or exposed secret.
Use GitHub's **Report a vulnerability** feature in the repository Security tab.
Include affected commit, reproduction steps, impact, and any suggested
mitigation. Do not include live credentials or private customer data.
