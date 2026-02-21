import 'dotenv/config';
import { test, expect } from '../fixtures/testWithMetaMask';

const chainQuery = process.env.CHAIN_QUERY || 'local';

test.describe('WhaleSwap create-order flow', () => {
  test('creates a new order with MetaMask confirmations', async ({ page, metamask }) => {
    await page.goto(`/?chain=${chainQuery}`);

    const walletConnect = page.locator('#walletConnect');
    await expect(walletConnect).toBeVisible();
    await walletConnect.click();
    await metamask.connectToDapp();

    const createOrderTab = page.locator('.tab-button[data-tab="create-order"]');
    await createOrderTab.click();

    await expect(page.locator('#sellTokenSelector')).toBeVisible();
    await expect(page.locator('#buyTokenSelector')).toBeVisible();

    await page.locator('#sellTokenSelector').click();
    await expect(page.locator('#sellAllowedTokenList .token-item').first()).toBeVisible();
    await page.locator('#sellAllowedTokenList .token-item').first().click();

    await page.locator('#buyTokenSelector').click();
    await expect(page.locator('#buyAllowedTokenList .token-item').nth(1)).toBeVisible();
    await page.locator('#buyAllowedTokenList .token-item').nth(1).click();

    await page.locator('#sellAmount').fill('10');
    await page.locator('#buyAmount').fill('15');

    await page.locator('#createOrderBtn').click();

    // 1) sell token approval, 2) fee token approval, 3) createOrder tx
    await metamask.confirmTransaction();
    await metamask.confirmTransaction();
    await metamask.confirmTransactionAndWaitForMining();

    await expect(page.locator('#toast-container .toast-message').filter({ hasText: 'Order created successfully!' })).toBeVisible();
  });
});
