import { test, expect, type Page } from '../fixtures/testWithMockWallet';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { readIsAllowedToken } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const TOKEN_TO_TOGGLE = localDeployment.contracts.tokenB.toLowerCase();
const OWNER = localDeployment.deployer.toLowerCase();

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const ensureConnectedAccount = async (page: Page, account: string) => {
  await expect(page.locator('#accountAddress')).toHaveText(shortAddress(account), { timeout: 20_000 });
};

const setAdminTokenUpdateRow = async (page: Page, action: 'add' | 'delete', tokenAddress: string) => {
  const rows = page.locator('.admin-token-row');
  if ((await rows.count()) === 0) {
    await page.locator('#admin-add-token').click();
  }

  const row = page.locator('.admin-token-row').first();
  const addressInput = row.locator('.admin-token-address');
  const actionSelect = row.locator('.admin-token-action');
  await actionSelect.selectOption(action);
  await expect(actionSelect).toHaveValue(action, { timeout: 10_000 });

  if (action === 'add') {
    await expect(addressInput).not.toHaveAttribute('readonly', 'readonly');
    await addressInput.fill(tokenAddress);
    return;
  }

  await expect(addressInput).toHaveAttribute('readonly', 'readonly', { timeout: 10_000 });
  await addressInput.evaluate((node, value) => {
    const input = node as HTMLInputElement;
    input.value = value as string;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, tokenAddress);

  await expect
    .poll(async () => (await addressInput.inputValue()).toLowerCase(), {
      timeout: 20_000,
      intervals: [500, 1_000, 2_000]
    })
    .toBe(tokenAddress.toLowerCase());
};

const expectAdminTokenRowAddress = async (page: Page, tokenAddress: string) => {
  const addressInput = page.locator('.admin-token-row').first().locator('.admin-token-address');
  await expect
    .poll(async () => (await addressInput.inputValue()).toLowerCase(), {
      timeout: 10_000,
      intervals: [500, 1_000, 2_000]
    })
    .toBe(tokenAddress.toLowerCase());
};

const readBuyTokenSymbols = async (page: Page): Promise<string[]> => {
  await page.locator('#buyTokenSelector').click();
  const buyModal = page.locator('#buyTokenModal');

  await expect
    .poll(async () => (await page.locator('#buyAllowedTokenList .token-item-symbol').count()) > 0, {
      timeout: 20_000,
      intervals: [500, 1_000, 2_000]
    })
    .toBe(true);

  const symbols = (await page.locator('#buyAllowedTokenList .token-item-symbol').allTextContents())
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);

  await buyModal.locator('.token-modal-close').click();
  await expect(buyModal).toBeHidden({ timeout: 10_000 });

  return symbols;
};

test.describe('WhaleSwap admin allowed tokens', () => {
  test('owner can remove and re-add an allowed token reflected in create order selectors', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await page.goto(`/?chain=${chainQuery}`);
    await hardhatWallet.switchAccount(page, OWNER);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(OWNER), { timeout: 15_000 });

    const adminTabButton = page.locator('.tab-button[data-tab="admin"]');
    await expect(adminTabButton).toBeVisible({ timeout: 20_000 });
    await adminTabButton.click();
    await expect(page.locator('#admin-update-tokens')).toBeVisible();

    await setAdminTokenUpdateRow(page, 'delete', TOKEN_TO_TOGGLE);
    await expectAdminTokenRowAddress(page, TOKEN_TO_TOGGLE);
    await page.locator('#admin-update-tokens').click();

    await expect
      .poll(async () => (await readIsAllowedToken(whaleSwapAddress, TOKEN_TO_TOGGLE)) === false, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await page.reload();
    await ensureConnectedAccount(page, OWNER);
    await page.locator('.tab-button[data-tab="create-order"]').click();
    await expect(page.locator('#buyTokenSelector')).toBeVisible();
    const symbolsAfterDelete = await readBuyTokenSymbols(page);
    expect(symbolsAfterDelete).not.toContain('LTKB');

    await page.locator('.tab-button[data-tab="admin"]').click();
    await setAdminTokenUpdateRow(page, 'add', TOKEN_TO_TOGGLE);
    await expectAdminTokenRowAddress(page, TOKEN_TO_TOGGLE);
    await page.locator('#admin-update-tokens').click();

    await expect
      .poll(async () => (await readIsAllowedToken(whaleSwapAddress, TOKEN_TO_TOGGLE)) === true, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await page.reload();
    await ensureConnectedAccount(page, OWNER);
    await page.locator('.tab-button[data-tab="create-order"]').click();
    const symbolsAfterAdd = await readBuyTokenSymbols(page);
    expect(symbolsAfterAdd).toContain('LTKB');
  });
});
