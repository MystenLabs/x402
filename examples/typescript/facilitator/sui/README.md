# x402 Sui facilitator example

Minimal Express facilitator that registers the `@x402/sui` exact scheme and
exposes `/verify` and `/settle` endpoints. Mirrors `../basic` but Sui-only.

## Run

```sh
cp .env.example .env  # then fill in SUI_PRIVATE_KEY (suiprivkey... bech32 form)
pnpm install
pnpm dev
```

## Environment

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4023` | HTTP port to listen on |
| `SUI_NETWORK` | `sui:testnet` | CAIP-2 identifier; `sui:mainnet` or `sui:testnet` |
| `SUI_PRIVATE_KEY` | _required_ | Sui private key in bech32 form (`suiprivkey...`) used as the gas sponsor / facilitator account. Only needed for sponsored transactions in this reference; the non-sponsored happy path needs the account purely for broadcasts. |

## Endpoints

- `POST /verify` — body `{ paymentPayload, paymentRequirements }`. Validates per the [exact Sui scheme spec](../../../../specs/schemes/exact/scheme_exact_sui.md).
- `POST /settle` — same body shape. Re-verifies, broadcasts the user-signed transaction, returns the on-chain digest.
