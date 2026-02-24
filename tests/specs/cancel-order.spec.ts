import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { ensureAllowance, readClaimable, readNextOrderId } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const FEE_TOKEN = localDeployment.contracts.feeToken.toLowerCase();
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();
const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();

const SELL_AMOUNT = 2n * 10n ** 18n;
const BUY_AMOUNT = 3n * 10n ** 18n;
const ORDER_FEE_AMOUNT = 1n * 10n ** 18n;

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

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

test.describe('WhaleSwap cancel order flow', () => {
  test('maker cancels order and receives claimable credit', async ({ page }) => {
    test.setTimeout(180_000);

    await ensureAllowance(LTKA, MAKER, whaleSwapAddress, SELL_AMOUNT);
    await ensureAllowance(FEE_TOKEN, MAKER, whaleSwapAddress, ORDER_FEE_AMOUNT);
    const makerClaimableBefore = await readClaimable(whaleSwapAddress, MAKER, LTKA);

    await page.goto(`/?chain=${chainQuery}`);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });

    await page.locator('.tab-button[data-tab="create-order"]').click();
    await expect(page.locator('#sellTokenSelector')).toBeVisible();

    await selectTokenBySymbol(page, 'sell', 'LTKA', LTKA);
    await selectTokenBySymbol(page, 'buy', 'LTKB', LTKB);
    await page.fill('#sellAmount', '2');
    await page.fill('#buyAmount', '3');

    const nextOrderIdBefore = await readNextOrderId(whaleSwapAddress);
    const createdOrderId = nextOrderIdBefore.toString();

    const createOrderBtn = page.locator('#createOrderBtn');
    await expect(createOrderBtn).toBeEnabled({ timeout: 15_000 });
    await createOrderBtn.click();

    await expect
      .poll(async () => (await readNextOrderId(whaleSwapAddress)) === nextOrderIdBefore + 1n, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await page.locator('.tab-button[data-tab="my-orders"]').click();
    const myOrderRow = page.locator(`#my-orders tbody tr[data-order-id="${createdOrderId}"]`);
    await expect(myOrderRow).toBeVisible({ timeout: 20_000 });

    const cancelButton = myOrderRow.locator('.cancel-order-btn');
    await expect(cancelButton).toBeVisible({ timeout: 20_000 });
    await cancelButton.click();

    await expect
      .poll(async () => (await readClaimable(whaleSwapAddress, MAKER, LTKA)) === makerClaimableBefore + SELL_AMOUNT, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    const myOrdersFilterToggle = page.locator('#my-orders #fillable-orders-toggle');
    if ((await myOrdersFilterToggle.count()) > 0 && (await myOrdersFilterToggle.isChecked())) {
      await myOrdersFilterToggle.uncheck();
    }

    const myOrderStatusCell = page.locator(`#my-orders tbody tr[data-order-id="${createdOrderId}"] td.order-status`);
    await expect(myOrderStatusCell).toContainText('Canceled', { timeout: 20_000 });
    await expect(page.locator(`#my-orders tbody tr[data-order-id="${createdOrderId}"] .cancel-order-btn`)).toHaveCount(0);

    await page.locator('.tab-button[data-tab="view-orders"]').click();
    const viewOrdersFilterToggle = page.locator('#view-orders #fillable-orders-toggle');
    if ((await viewOrdersFilterToggle.count()) > 0 && (await viewOrdersFilterToggle.isChecked())) {
      await viewOrdersFilterToggle.uncheck();
    }

    const viewOrderRow = page.locator(`#view-orders tbody tr[data-order-id="${createdOrderId}"]`);
    await expect(viewOrderRow).toBeVisible({ timeout: 20_000 });
    await expect(viewOrderRow.locator('td.order-status')).toContainText('Canceled');
    await expect(page.locator(`#view-orders button.fill-button[data-order-id="${createdOrderId}"]`)).toHaveCount(0);
  });
});
