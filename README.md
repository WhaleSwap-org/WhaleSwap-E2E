# WhaleSwap E2E

Playwright end-to-end tests for WhaleSwap using a mocked `window.ethereum` provider that forwards RPC calls to local Hardhat.

## Scope

- Wallet connection flow without MetaMask extension automation
- Local Hardhat-backed RPC behavior for realistic contract reads/writes

## Prerequisites

- `whaleswap-contract`, `whaleswap-ui`, and `whaleswap-e2e` repos available as sibling directories
- Node.js 20 or 22 recommended (Hardhat currently warns on Node 23)
- `npm` available
- Ports `8545` (Hardhat) and `5500` (UI) available
- Chromium available for Playwright

## Install

Install dependencies in all three repos:

```bash
cd /Users/erebus/Documents/code/liberdus/whaleswap-contract && npm install
cd /Users/erebus/Documents/code/liberdus/whaleswap-ui && npm install
cd /Users/erebus/Documents/code/liberdus/whaleswap-e2e && npm install
```

Install Playwright browser in e2e:

```bash
cd /Users/erebus/Documents/code/liberdus/whaleswap-e2e
npx playwright install chromium
```

## Environment

No environment file is required for local dev. Defaults are committed in `e2e.config.ts`.

Optional overrides (via shell env or `.env`):

- `BASE_URL` (default: `http://127.0.0.1:5500`)
- `CHAIN_QUERY` (default: `local`)
- `MOCK_WALLET_RPC_URL` (default: `http://127.0.0.1:8545`)
- `MOCK_WALLET_CHAIN_ID` (default: `0x539`)
- `MOCK_WALLET_ACCOUNT` (default: Hardhat account #1 / maker `0x7099...79c8`)

If you want a local override file, copy `.env.example` to `.env`.

## One-command Local Run

Run end-to-end setup + tests from `whaleswap-e2e`:

```bash
npm run test:e2e:local
```

This script:

1. Starts Hardhat on `127.0.0.1:8545`
2. Runs `deploy:local` in `whaleswap-contract`
3. Starts UI on `127.0.0.1:5500`
4. Runs Playwright tests (headless by default)
5. Stops Hardhat/UI on exit

If Hardhat or UI are already running on those ports, the script reuses them by default.

Script path:

- `scripts/run-local-e2e.sh`

Logs are written to:

- `.logs/local-e2e`

Pass a specific spec or Playwright args:

```bash
npm run test:e2e:local -- tests/specs/create-order.spec.ts --project=chromium
```

Optional toggle:

- `REUSE_EXISTING_SERVICES=false` to fail instead of reusing already-running Hardhat/UI

## Manual Local Startup (Alternative)

Start these in separate terminals:

1. Hardhat node

```bash
cd /Users/erebus/Documents/code/liberdus/whaleswap-contract
npm run node
```

2. Local contract deploy

```bash
cd /Users/erebus/Documents/code/liberdus/whaleswap-contract
npm run deploy:local
```

3. UI server

```bash
cd /Users/erebus/Documents/code/liberdus/whaleswap-ui
npm run start -- -p 5500 -a 127.0.0.1
```

## Run Playwright Tests

```bash
npm run test:e2e
```

Headed:

```bash
npm run test:e2e:headed
```

Headless:

```bash
npm run test:e2e:headless
```

## Manual GitHub Action

This repo includes a manual workflow:

- `.github/workflows/manual-e2e.yml`

Run it from GitHub:

1. Open **Actions** in `WhaleSwap-E2E`
2. Select **Manual E2E**
3. Click **Run workflow**
4. Optionally provide `playwright_args` (for a specific spec/filter)

## Structure

- `tests/fixtures/testWithMockWallet.ts`: Shared Playwright fixture injecting a Hardhat-backed EIP-1193 provider and auto snapshot/revert (`evm_snapshot` + `evm_revert`) per test
- `tests/helpers/hardhatChain.ts`: Shared chain helpers (RPC, balances, allowances, next-order-id, receipts, snapshots)
- `tests/specs/*.spec.ts`: E2E test cases

## Notes

- Wallet UI is mocked, but RPC is forwarded to Hardhat for chain-backed behavior.
- `local` chain option is expected to appear only on localhost hosts by UI design.
- Test workers are set to `1` because all tests target the same local Hardhat chain state.
