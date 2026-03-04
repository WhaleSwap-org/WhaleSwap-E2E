import { test, expect } from '../fixtures/testWithMockWallet';
import type { Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { ensureAllowance, readNextOrderId } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const FEE_TOKEN = localDeployment.contracts.feeToken.toLowerCase();
const LTKA = localDeployment.contracts.tokenA.toLowerCase();
const LTKB = localDeployment.contracts.tokenB.toLowerCase();

const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();
const INVITED_TAKER = localDeployment.fundedAccounts.taker.toLowerCase();

const SELL_AMOUNT = 2n * 10n ** 18n;
const BUY_AMOUNT = 3n * 10n ** 18n;
const ORDER_FEE_AMOUNT = 1n * 10n ** 18n;

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const ensureAllowanceBestEffort = async (
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  amount: bigint
) => {
  try {
    await ensureAllowance(tokenAddress, ownerAddress, spenderAddress, amount);
  } catch (error) {
    // Some local runners may not have allowance preflight calls fully wired at test start.
    // Continue and let UI-driven order flow handle approvals if needed.
    console.warn('[order-tab-visibility] ensureAllowance preflight skipped:', error);
  }
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

async function createRestrictedOrder(page: Page, takerAddress: string) {
  await page.locator('.tab-button[data-tab="create-order"]').click();
  await expect(page.locator('#sellTokenSelector')).toBeVisible();

  await selectTokenBySymbol(page, 'sell', 'LTKA', LTKA);
  await selectTokenBySymbol(page, 'buy', 'LTKB', LTKB);
  await page.fill('#sellAmount', '2');
  await page.fill('#buyAmount', '3');

  await page.locator('.taker-toggle').click();
  await expect(page.locator('#takerAddress')).toBeVisible({ timeout: 15_000 });
  await page.fill('#takerAddress', takerAddress);

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

  return createdOrderId;
}

test.describe('WhaleSwap order tab visibility', () => {
  test('shows My Orders / Invited Orders only when account has matching orders', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await ensureAllowanceBestEffort(LTKA, MAKER, whaleSwapAddress, SELL_AMOUNT);
    await ensureAllowanceBestEffort(FEE_TOKEN, MAKER, whaleSwapAddress, ORDER_FEE_AMOUNT);
    await ensureAllowanceBestEffort(LTKB, INVITED_TAKER, whaleSwapAddress, BUY_AMOUNT);

    await page.goto(`/?chain=${chainQuery}`);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });
    await page.reload();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });

    // Before any orders, restricted tabs should be hidden.
    await expect(page.locator('.tab-button[data-tab="my-orders"]')).toBeHidden();
    await expect(page.locator('.tab-button[data-tab="taker-orders"]')).toBeHidden();

    const createdOrderId = await createRestrictedOrder(page, INVITED_TAKER);

    // Maker now has an order, so My Orders should appear; Invited Orders stays hidden.
    await expect(page.locator('.tab-button[data-tab="my-orders"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.tab-button[data-tab="taker-orders"]')).toBeHidden();

    await page.locator('.tab-button[data-tab="my-orders"]').click();
    await expect(page.locator(`#my-orders tbody tr[data-order-id="${createdOrderId}"]`)).toBeVisible({ timeout: 20_000 });

    // Switch to invited taker account; Invited Orders should appear and My Orders should hide.
    await hardhatWallet.switchAccount(page, INVITED_TAKER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(INVITED_TAKER), { timeout: 15_000 });

    await expect(page.locator('.tab-button[data-tab="taker-orders"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.tab-button[data-tab="my-orders"]')).toBeHidden();

    await page.locator('.tab-button[data-tab="taker-orders"]').click();
    await expect(page.locator(`#taker-orders tbody tr[data-order-id="${createdOrderId}"]`)).toBeVisible({ timeout: 20_000 });
  });
});
