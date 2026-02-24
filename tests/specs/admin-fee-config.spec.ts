import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import {
  ensureAllowance,
  readFeeToken,
  readNextOrderId,
  readOrder,
  readOrderCreationFeeAmount
} from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();
const FEE_TOKEN_6 = localDeployment.contracts.feeToken6.toLowerCase();

const OWNER = localDeployment.deployer.toLowerCase();
const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();

const SELL_AMOUNT = 2n * 10n ** 18n;
const NEW_FEE_UNITS = 2n * 10n ** 6n;

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

test.describe('WhaleSwap admin fee config', () => {
  test('owner updates fee config and new orders snapshot updated fee token/amount', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await ensureAllowance(LTKA, MAKER, whaleSwapAddress, SELL_AMOUNT);
    await ensureAllowance(FEE_TOKEN_6, MAKER, whaleSwapAddress, NEW_FEE_UNITS);

    await page.goto(`/?chain=${chainQuery}`);
    await hardhatWallet.switchAccount(page, OWNER);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(OWNER), { timeout: 15_000 });

    const adminTabButton = page.locator('.tab-button[data-tab="admin"]');
    await expect(adminTabButton).toBeVisible({ timeout: 20_000 });
    await adminTabButton.click();

    await page.fill('#admin-fee-token', FEE_TOKEN_6);
    await page.fill('#admin-fee-amount', '2');
    await page.locator('#admin-update-fee').click();

    await expect
      .poll(
        async () =>
          (await readFeeToken(whaleSwapAddress)) === FEE_TOKEN_6 &&
          (await readOrderCreationFeeAmount(whaleSwapAddress)) === NEW_FEE_UNITS,
        { timeout: 45_000, intervals: [500, 1_000, 2_000] }
      )
      .toBe(true);

    await hardhatWallet.switchAccount(page, MAKER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });

    await page.locator('.tab-button[data-tab="create-order"]').click();
    await expect(page.locator('#sellTokenSelector')).toBeVisible();
    await selectTokenBySymbol(page, 'sell', 'LTKA', LTKA);
    await selectTokenBySymbol(page, 'buy', 'LTKB', LTKB);
    await page.fill('#sellAmount', '2');
    await page.fill('#buyAmount', '3');

    const nextOrderIdBefore = await readNextOrderId(whaleSwapAddress);
    await page.locator('#createOrderBtn').click();
    await expect
      .poll(async () => (await readNextOrderId(whaleSwapAddress)) === nextOrderIdBefore + 1n, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    const createdOrder = await readOrder(whaleSwapAddress, nextOrderIdBefore);
    expect(createdOrder.feeToken).toBe(FEE_TOKEN_6);
    expect(createdOrder.orderCreationFee).toBe(NEW_FEE_UNITS);
  });
});
