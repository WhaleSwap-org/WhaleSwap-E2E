import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';

const chainQuery = e2eConfig.chainQuery;
const rpcUrl = e2eConfig.mockWalletRpcUrl;
const nextOrderIdSelector = '0x2a58b330';
const whaleSwapAddress = localDeployment.contracts.otcSwap;
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();

const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const json = (await response.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(`RPC ${method} failed: ${json.error.message || 'unknown error'}`);
  }
  return json.result as T;
};

const readNextOrderId = async (): Promise<bigint> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: nextOrderIdSelector }, 'latest']);
  return BigInt(result);
};

const selectTokenBySymbol = async (
  page: Page,
  type: 'sell' | 'buy',
  tokenSymbol: 'LTKA' | 'LTKB',
  expectedAddress?: string
) => {
  await page.locator(`#${type}TokenSelector`).click();
  const item = page
    .locator(`#${type}AllowedTokenList .token-item`, {
      has: page.locator(`.token-item-symbol:text-is("${tokenSymbol}")`)
    })
    .first();
  await expect(item).toBeVisible({ timeout: 15_000 });

  if (expectedAddress) {
    const selectedAddress = await item.getAttribute('data-address');
    if (!selectedAddress || selectedAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error(
        `Expected ${tokenSymbol} address ${expectedAddress}, got ${selectedAddress || '<missing data-address>'}`
      );
    }
  }

  await item.click();
  await expect(page.locator(`#${type}TokenSelector .token-symbol`)).toHaveText(tokenSymbol);
};

test.describe('WhaleSwap create-order flow', () => {
  test('creates an order on local hardhat', async ({ page }) => {
    await page.goto(`/?chain=${chainQuery}`);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.locator('#accountAddress')).toBeVisible({ timeout: 15_000 });

    const createOrderTab = page.locator('.tab-button[data-tab="create-order"]');
    await createOrderTab.click();

    await expect(page.locator('#sellTokenSelector')).toBeVisible();
    await expect(page.locator('#buyTokenSelector')).toBeVisible();
    await expect(page.locator('#sellAmount')).toBeVisible();
    await expect(page.locator('#buyAmount')).toBeVisible();

    await selectTokenBySymbol(page, 'sell', 'LTKA', LTKA);
    await selectTokenBySymbol(page, 'buy', 'LTKB', LTKB);

    await page.fill('#sellAmount', '1');
    await page.fill('#buyAmount', '1');

    const nextOrderIdBefore = await readNextOrderId();

    const createOrderBtn = page.locator('#createOrderBtn');
    await expect(createOrderBtn).toBeEnabled({ timeout: 15_000 });
    await createOrderBtn.click();

    await expect
      .poll(async () => (await readNextOrderId()) === nextOrderIdBefore + 1n, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    const createdOrderId = nextOrderIdBefore.toString();
    await page.locator('.tab-button[data-tab="view-orders"]').click();
    await expect
      .poll(
        async () =>
          page.evaluate((orderId) => {
            const row = document.querySelector(`#view-orders tbody tr[data-order-id="${orderId}"]`);
            return !!row;
          }, createdOrderId),
        { timeout: 20_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe(true);
  });
});
