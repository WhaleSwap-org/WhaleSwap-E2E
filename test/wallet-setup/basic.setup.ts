import 'dotenv/config';
import { defineWalletSetup } from '@synthetixio/synpress-cache';
import { MetaMask, getExtensionId } from '@synthetixio/synpress/playwright';

const walletPassword = process.env.METAMASK_WALLET_PASSWORD || 'whaleswap-local-pass-123';
const seedPhrase = process.env.METAMASK_SEED_PHRASE || 'test test test test test test test test test test test junk';

export default defineWalletSetup(walletPassword, async (context, walletPage) => {
  const extensionId = await getExtensionId(context, 'MetaMask');
  const metamask = new MetaMask(context, walletPage, walletPassword, extensionId);

  await metamask.importWallet(seedPhrase);

  // Ensure local hardhat network can be selected from dapp wallet prompts.
  // If it already exists in cache state, this may throw and can be ignored.
  try {
    await metamask.addNetwork({
      name: 'Hardhat Local',
      rpcUrl: 'http://127.0.0.1:8545',
      chainId: 1337,
      symbol: 'ETH',
      blockExplorerUrl: 'http://127.0.0.1:8545'
    });
  } catch {
    // no-op
  }
});
