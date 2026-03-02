import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { ensureAllowance, increaseTime, readGracePeriod, readNextOrderId, readOrderExpiry } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const FEE_TOKEN = localDeployment.contracts.feeToken.toLowerCase();
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();

const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();
const TAKER = localDeployment.fundedAccounts.taker.toLowerCase();

const SELL_AMOUNT = 2n * 10n ** 18n;
const ORDER_FEE_AMOUNT = 1n * 10n ** 18n;

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const waitForAppReady = async (page: Page) => {
  const loader = page.locator('#app-bootstrap-loader');
  if ((await loader.count()) > 0) {
    await expect(loader).toBeHidden({ timeout: 30_000 });
  }
};

const readCleanupReadyCount = async (page: Page): Promise<number> => {
  const text = (await page.locator('#cleanup-ready').textContent())?.trim() || '';
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : -1;
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

test.describe('WhaleSwap expiry and grace lifecycle', () => {
  test('order becomes expired and then cleanup-eligible after grace period', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await ensureAllowance(LTKA, MAKER, whaleSwapAddress, SELL_AMOUNT);
    await ensureAllowance(FEE_TOKEN, MAKER, whaleSwapAddress, ORDER_FEE_AMOUNT);

    const orderExpiry = await readOrderExpiry(whaleSwapAddress);
    const gracePeriod = await readGracePeriod(whaleSwapAddress);

    await page.goto(`/?chain=${chainQuery}`);
    await waitForAppReady(page);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });

    await page.locator('.tab-button[data-tab="create-order"]').click();
    await expect(page.locator('#sellTokenSelector')).toBeVisible();

    await selectTokenBySymbol(page, 'sell', 'LTKA', LTKA);
    await selectTokenBySymbol(page, 'buy', 'LTKB', LTKB);
    await page.fill('#sellAmount', '2');
    await page.fill('#buyAmount', '3');

    const nextOrderIdBefore = await readNextOrderId(whaleSwapAddress);
    const createdOrderId = nextOrderIdBefore.toString();
    await page.locator('#createOrderBtn').click();

    await expect
      .poll(async () => (await readNextOrderId(whaleSwapAddress)) === nextOrderIdBefore + 1n, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await hardhatWallet.switchAccount(page, TAKER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(TAKER), { timeout: 15_000 });

    await page.locator('.tab-button[data-tab="view-orders"]').click();
    const fillButtonBeforeExpiry = page.locator(`#view-orders button.fill-button[data-order-id="${createdOrderId}"]`);
    await expect(fillButtonBeforeExpiry).toBeVisible({ timeout: 20_000 });

    await increaseTime(orderExpiry + 5n);
    await page.reload();
    await waitForAppReady(page);
    await hardhatWallet.connect(page);
    await page.locator('.tab-button[data-tab="view-orders"]').click();

    const viewOrdersFilterToggle = page.locator('#view-orders #fillable-orders-toggle');
    if ((await viewOrdersFilterToggle.count()) > 0 && (await viewOrdersFilterToggle.isChecked())) {
      await viewOrdersFilterToggle.uncheck();
    }

    const expiredRow = page.locator(`#view-orders tbody tr[data-order-id="${createdOrderId}"]`);
    await expect(expiredRow).toBeVisible({ timeout: 20_000 });
    await expect(expiredRow.locator('td.order-status')).toContainText('Expired');
    await expect(page.locator(`#view-orders button.fill-button[data-order-id="${createdOrderId}"]`)).toHaveCount(0);

    await page.locator('.tab-button[data-tab="cleanup-orders"]').click();
    await expect
      .poll(async () => await readCleanupReadyCount(page), {
        timeout: 20_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBeGreaterThanOrEqual(0);
    const cleanupReadyBeforeGrace = await readCleanupReadyCount(page);

    await increaseTime(gracePeriod + 5n);
    await page.reload();
    await waitForAppReady(page);
    await hardhatWallet.connect(page);
    await page.locator('.tab-button[data-tab="cleanup-orders"]').click();

    await expect
      .poll(async () => await readCleanupReadyCount(page), {
        timeout: 20_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBeGreaterThanOrEqual(cleanupReadyBeforeGrace + 1);

    await expect(page.locator('#cleanup-button')).toBeEnabled();
  });
});
