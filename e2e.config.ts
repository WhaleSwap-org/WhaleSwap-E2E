import 'dotenv/config';

const DEFAULTS = {
  BASE_URL: 'http://127.0.0.1:8080',
  CHAIN_QUERY: 'local',
  MOCK_WALLET_RPC_URL: 'http://127.0.0.1:8545',
  MOCK_WALLET_CHAIN_ID: '0x539',
  MOCK_WALLET_ACCOUNT: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
} as const;

export const e2eConfig = {
  baseUrl: process.env.BASE_URL || DEFAULTS.BASE_URL,
  chainQuery: process.env.CHAIN_QUERY || DEFAULTS.CHAIN_QUERY,
  mockWalletRpcUrl: process.env.MOCK_WALLET_RPC_URL || process.env.HARDHAT_RPC_URL || DEFAULTS.MOCK_WALLET_RPC_URL,
  mockWalletChainId: process.env.MOCK_WALLET_CHAIN_ID || DEFAULTS.MOCK_WALLET_CHAIN_ID,
  mockWalletAccount: (process.env.MOCK_WALLET_ACCOUNT || DEFAULTS.MOCK_WALLET_ACCOUNT).toLowerCase(),
  headless: process.env.HEADLESS === 'true'
} as const;

