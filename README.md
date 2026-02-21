# WhaleSwap E2E

Playwright end-to-end tests for WhaleSwap using a mocked `window.ethereum` provider that forwards RPC calls to local Hardhat.

## Scope

- Wallet connection flow without MetaMask extension automation
- Local Hardhat-backed RPC behavior for realistic contract reads/writes

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
- `CHAIN_QUERY` (default: `local`)
- `MOCK_WALLET_RPC_URL` (default: `http://127.0.0.1:8545`)
- `MOCK_WALLET_CHAIN_ID` (default: `0x539`)
- `MOCK_WALLET_ACCOUNT` (default: Hardhat account #1 / maker `0x7099...79c8`)

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

## Structure

- `tests/fixtures/testWithMockWallet.ts`: Shared Playwright fixture injecting a Hardhat-backed EIP-1193 provider
- `tests/specs/*.spec.ts`: E2E test cases

## Notes

- Wallet UI is mocked, but RPC is forwarded to Hardhat for chain-backed behavior.
- `local` chain option is expected to appear only on localhost hosts by UI design.
