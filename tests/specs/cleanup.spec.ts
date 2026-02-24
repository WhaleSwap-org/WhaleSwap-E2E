import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import {
  ensureAllowance,
  increaseTime,
  readAccumulatedFeesByToken,
  readClaimable,
  readFirstOrderId,
  readGracePeriod,
  readNextOrderId,
  readOrder,
  readOrderExpiry
} from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const FEE_TOKEN = localDeployment.contracts.feeToken.toLowerCase();
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();

const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();
const CLEANER = localDeployment.fundedAccounts.taker.toLowerCase();

const SELL_AMOUNT = 2n * 10n ** 18n;
const ORDER_FEE_AMOUNT = 1n * 10n ** 18n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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

test.describe('WhaleSwap cleanup flow', () => {
  test('cleanup credits maker principal and cleaner fee, then removes order', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await ensureAllowance(LTKA, MAKER, whaleSwapAddress, SELL_AMOUNT);
    await ensureAllowance(FEE_TOKEN, MAKER, whaleSwapAddress, ORDER_FEE_AMOUNT);

    const orderExpiry = await readOrderExpiry(whaleSwapAddress);
    const gracePeriod = await readGracePeriod(whaleSwapAddress);
    const firstOrderIdBefore = await readFirstOrderId(whaleSwapAddress);
    const nextOrderIdBefore = await readNextOrderId(whaleSwapAddress);

    let targetOrderId = firstOrderIdBefore;

    if (firstOrderIdBefore === nextOrderIdBefore) {
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

      targetOrderId = nextOrderIdBefore;
      await page.locator('#createOrderBtn').click();

      await expect
        .poll(async () => (await readNextOrderId(whaleSwapAddress)) === nextOrderIdBefore + 1n, {
          timeout: 45_000,
          intervals: [500, 1_000, 2_000]
        })
        .toBe(true);
    } else {
      await page.goto(`/?chain=${chainQuery}`);
    }

    const targetOrder = await readOrder(whaleSwapAddress, targetOrderId);
    if (!targetOrder.exists || targetOrder.maker === ZERO_ADDRESS) {
      throw new Error(`Target order ${targetOrderId.toString()} does not exist`);
    }

    const makerClaimableBefore = await readClaimable(whaleSwapAddress, targetOrder.maker, targetOrder.sellToken);
    const cleanerClaimableBefore = await readClaimable(whaleSwapAddress, CLEANER, targetOrder.feeToken);
    const accumulatedFeesBeforeCleanup = await readAccumulatedFeesByToken(whaleSwapAddress, targetOrder.feeToken);

    await hardhatWallet.switchAccount(page, CLEANER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(CLEANER), { timeout: 15_000 });

    await increaseTime(orderExpiry + gracePeriod + 5n);
    await page.reload();
    await hardhatWallet.connect(page);

    await page.locator('.tab-button[data-tab="cleanup-orders"]').click();
    await expect
      .poll(
        async () => {
          const text = (await page.locator('#cleanup-ready').textContent())?.trim() || '';
          const value = Number.parseInt(text, 10);
          return Number.isFinite(value) ? value : -1;
        },
        { timeout: 20_000, intervals: [500, 1_000, 2_000] }
      )
      .toBeGreaterThanOrEqual(1);

    const cleanupButton = page.locator('#cleanup-button');
    await expect(cleanupButton).toBeEnabled();
    await cleanupButton.click();

    await expect
      .poll(async () => (await readFirstOrderId(whaleSwapAddress)) === firstOrderIdBefore + 1n, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await expect
      .poll(async () => !(await readOrder(whaleSwapAddress, targetOrderId)).exists, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await expect
      .poll(
        async () =>
          (await readClaimable(whaleSwapAddress, targetOrder.maker, targetOrder.sellToken)) ===
          (targetOrder.status === 0 ? makerClaimableBefore + targetOrder.sellAmount : makerClaimableBefore),
        {
          timeout: 45_000,
          intervals: [500, 1_000, 2_000]
        }
      )
      .toBe(true);

    await expect
      .poll(
        async () =>
          (await readClaimable(whaleSwapAddress, CLEANER, targetOrder.feeToken)) ===
          cleanerClaimableBefore + targetOrder.orderCreationFee,
        {
          timeout: 45_000,
          intervals: [500, 1_000, 2_000]
        }
      )
      .toBe(true);

    await expect
      .poll(
        async () =>
          (await readAccumulatedFeesByToken(whaleSwapAddress, targetOrder.feeToken)) ===
          accumulatedFeesBeforeCleanup - targetOrder.orderCreationFee,
        {
          timeout: 45_000,
          intervals: [500, 1_000, 2_000]
        }
      )
      .toBe(true);
  });
});
