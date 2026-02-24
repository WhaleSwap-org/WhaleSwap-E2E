import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { ensureAllowance, readBalance, readNextOrderId } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const FEE_TOKEN = localDeployment.contracts.feeToken.toLowerCase();
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();

const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();
const AUTHORIZED_TAKER = localDeployment.fundedAccounts.taker.toLowerCase();
const UNAUTHORIZED_TAKER = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';

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

test.describe('WhaleSwap restricted taker flow', () => {
  test('only the specified taker can fill the order', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await ensureAllowance(LTKA, MAKER, whaleSwapAddress, SELL_AMOUNT);
    await ensureAllowance(FEE_TOKEN, MAKER, whaleSwapAddress, ORDER_FEE_AMOUNT);
    await ensureAllowance(LTKB, AUTHORIZED_TAKER, whaleSwapAddress, BUY_AMOUNT);

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

    await page.locator('.taker-toggle').click();
    await expect(page.locator('#takerAddress')).toBeVisible({ timeout: 15_000 });
    await page.fill('#takerAddress', AUTHORIZED_TAKER);

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

    await hardhatWallet.switchAccount(page, UNAUTHORIZED_TAKER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(UNAUTHORIZED_TAKER), { timeout: 15_000 });

    await page.locator('.tab-button[data-tab="view-orders"]').click();
    const unauthorizedFilterToggle = page.locator('#view-orders #fillable-orders-toggle');
    if ((await unauthorizedFilterToggle.count()) > 0 && (await unauthorizedFilterToggle.isChecked())) {
      await unauthorizedFilterToggle.uncheck();
    }

    const unauthorizedRow = page.locator(`#view-orders tbody tr[data-order-id="${createdOrderId}"]`);
    await expect(unauthorizedRow).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`#view-orders button.fill-button[data-order-id="${createdOrderId}"]`)).toHaveCount(0);

    const makerLtkbBeforeFill = await readBalance(LTKB, MAKER);
    const takerLtkaBeforeFill = await readBalance(LTKA, AUTHORIZED_TAKER);
    const takerLtkbBeforeFill = await readBalance(LTKB, AUTHORIZED_TAKER);

    await hardhatWallet.switchAccount(page, AUTHORIZED_TAKER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(AUTHORIZED_TAKER), { timeout: 15_000 });

    await page.locator('.tab-button[data-tab="view-orders"]').click();
    const authorizedFilterToggle = page.locator('#view-orders #fillable-orders-toggle');
    if ((await authorizedFilterToggle.count()) > 0 && (await authorizedFilterToggle.isChecked())) {
      await authorizedFilterToggle.uncheck();
    }

    const fillButton = page.locator(`#view-orders button.fill-button[data-order-id="${createdOrderId}"]`);
    await expect(fillButton).toBeVisible({ timeout: 20_000 });
    await fillButton.click();

    await expect
      .poll(async () => page.locator(`#view-orders button.fill-button[data-order-id="${createdOrderId}"]`).count(), {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(0);

    await expect
      .poll(async () => {
        const makerLtkbAfterFill = await readBalance(LTKB, MAKER);
        const takerLtkaAfterFill = await readBalance(LTKA, AUTHORIZED_TAKER);
        const takerLtkbAfterFill = await readBalance(LTKB, AUTHORIZED_TAKER);

        return (
          makerLtkbAfterFill === makerLtkbBeforeFill + BUY_AMOUNT &&
          takerLtkaAfterFill === takerLtkaBeforeFill + SELL_AMOUNT &&
          takerLtkbAfterFill === takerLtkbBeforeFill - BUY_AMOUNT
        );
      }, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);
  });
});
