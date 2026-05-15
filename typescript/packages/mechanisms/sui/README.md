# @x402/sui

x402 Payment Protocol — Sui implementation.

Implements the [`exact` scheme on Sui](../../../specs/schemes/exact/scheme_exact_sui.md): direct
`0x2::coin::Coin<T>` transfers from a payer to the resource server, with optional sponsored
(gas-less) transactions via the facilitator.

## Install

```sh
pnpm add @x402/sui @x402/core
```

## Entry points

- `@x402/sui/exact/client` — `ExactSuiScheme` for building and signing the payment transaction.
- `@x402/sui/exact/server` — `ExactSuiScheme` for parsing prices and enhancing payment requirements
  (used by resource servers via the payment middleware).
- `@x402/sui/exact/facilitator` — `ExactSuiScheme` for verifying and settling Sui payments.

## Networks

- `sui:mainnet`
- `sui:testnet`

## Token defaults

USDC asset types per network are exposed as `USDC_MAINNET_COIN_TYPE` and `USDC_TESTNET_COIN_TYPE`.
