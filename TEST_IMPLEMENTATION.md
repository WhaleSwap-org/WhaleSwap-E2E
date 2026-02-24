# WhaleSwap E2E Test Implementation

This document explains how the Playwright tests are implemented, with focus on the mocked wallet and Hardhat integration.

## High-level design

The e2e suite does not automate a real MetaMask extension. Instead, it injects a mocked `window.ethereum` provider that forwards chain calls to the local Hardhat node.

Core files:

- `tests/fixtures/testWithMockWallet.ts`
- `tests/helpers/hardhatChain.ts`
- `playwright.config.ts`
- `e2e.config.ts`

## Mock wallet implementation

The browser context installs a custom EIP-1193-like provider using `context.addInitScript(...)` before app scripts run.

Provider behavior:

- Exposes `window.ethereum` with `isMetaMask = true`
- Implements common wallet methods:
  - `eth_requestAccounts`
  - `eth_accounts`
  - `eth_chainId`
  - `net_version`
  - `wallet_addEthereumChain`
  - `wallet_switchEthereumChain`
- Forwards JSON-RPC calls (`eth_*`, `net_*`, `web3_*`, `debug_*`, `txpool_*`) to Hardhat over HTTP
- Emits wallet events (`connect`, `accountsChanged`, `chainChanged`)
- Persists mock connection/account state in localStorage:
  - `__whaleswap_mock_wallet_connected__`
  - `__whaleswap_mock_wallet_account__`

Additional test-only helper:

- `window.__whaleswapMockSetAccount(account)` lets tests switch accounts without opening wallet UI.

## Hardhat chain integration

All tests target one configured RPC endpoint (`MOCK_WALLET_RPC_URL`, default `http://127.0.0.1:8545`).

`tests/helpers/hardhatChain.ts` provides:

- Generic JSON-RPC helper: `rpcCall`
- Snapshot control: `createSnapshot`, `revertSnapshot`
- Contract state readers using `eth_call`:
  - order ids, fee config, allowlist state, claimable balances, order tuples
- Time/chain controls:
  - `increaseTime` (`evm_increaseTime` + `evm_mine`)
  - `mineBlock`
- Token helpers:
  - `readBalance`, `readAllowance`
  - `ensureAllowance` (sends `approve` tx via Hardhat-backed wallet)
- Tx polling:
  - `waitForReceipt`

## Per-test lifecycle

The custom fixture auto-runs a snapshot/revert around every test:

1. `evm_snapshot` before test body
2. test executes
3. `evm_revert` after test body

This keeps tests isolated when running serially.

## Why tests are serial by default

`playwright.config.ts` sets:

- `workers: 1`
- `fullyParallel: false`

Reason: snapshot/revert operations are global to one Hardhat chain instance. Multiple workers on the same RPC can interfere with each other.

If parallelization is required, each worker must use its own isolated chain/deployment (separate RPC and app instance).

## How tests interact with the app

Typical sequence in a spec:

1. `page.goto(...)`
2. connect wallet (`#walletConnect`) or switch account via `hardhatWallet.switchAccount(...)`
3. perform UI actions
4. verify both:
  - UI state (rows, buttons, tab content)
  - on-chain state via `hardhatChain` helpers

This dual assertion pattern catches UI-only and chain-only regressions.

## Debug tips

Run one spec:

```bash
npx playwright test tests/specs/<name>.spec.ts --project=chromium
```

Open HTML report:

```bash
npx playwright show-report
```

On failure, inspect:

- `test-results/.../test-failed-1.png`
- `test-results/.../video.webm`
