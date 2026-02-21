# WhaleSwap E2E

Playwright + Synpress end-to-end tests for WhaleSwap with real MetaMask extension automation.

## Scope

- Wallet connection flow with MetaMask extension
- Local Hardhat chain test coverage for WhaleSwap UI
- Reusable wallet setup cache for fast reruns

## Prerequisites

- Node.js 20+ recommended
- Local WhaleSwap stack running (contract + UI)
- Chromium available for Playwright

## Install

```bash
npm install
npx playwright install chromium
```

## Environment

Copy and edit:

```bash
cp .env.example .env
```

Key vars:

- `BASE_URL` (default: `http://127.0.0.1:8080`)
- `METAMASK_SEED_PHRASE` (test-only wallet)
- `METAMASK_WALLET_PASSWORD`
- `CHAIN_QUERY` (default: `local`)

## Local System Under Test Startup

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
npm start
```

## Build Wallet Cache

Run once (or when wallet setup changes):

```bash
npm run cache:wallet
```

Headless cache build:

```bash
npm run cache:wallet:headless
```

## Run Tests

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

## Structure

- `tests/wallet-setup/basic.setup.ts`: Synpress wallet bootstrap (seed import + local chain add)
- `tests/fixtures/testWithMetaMask.ts`: Shared Playwright test fixture with MetaMask
- `tests/specs/*.spec.ts`: E2E test cases

## Notes

- Use only throwaway/dev seed phrases in `.env`.
- `local` chain option is expected to appear only on localhost hosts by UI design.
