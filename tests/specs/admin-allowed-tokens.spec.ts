import { test, expect, type Page } from '../fixtures/testWithMockWallet';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { readIsAllowedToken } from '../helpers/hardhatChain';
import { connectWalletFromUi } from '../helpers/uiReady';

const chainQuery = e2eConfig.chainQuery;

const whaleSwapAddress = localDeployment.contracts.otcSwap;
const TOKEN_TO_TOGGLE = localDeployment.contracts.tokenB.toLowerCase();
const OWNER = localDeployment.deployer.toLowerCase();

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const ensureConnectedAccount = async (page: Page, account: string) => {
  await expect(page.locator('#accountAddress')).toHaveText(shortAddress(account), { timeout: 20_000 });
};

const setAdminTokenUpdateRow = async (page: Page, action: 'add' | 'delete', tokenAddress: string) => {
  await expect(async () => {
    const rows = page.locator('.admin-token-row');
    if ((await rows.count()) === 0) {
      await page.locator('#admin-add-token').click();
    }

    const row = page.locator('.admin-token-row').first();
    const addressInput = row.locator('.admin-token-address');
    const actionSelect = row.locator('.admin-token-action');
    await actionSelect.selectOption(action);
    await expect(actionSelect).toHaveValue(action, { timeout: 5_000 });

    if (action === 'add') {
      await expect(addressInput).not.toHaveAttribute('readonly', 'readonly');
      await addressInput.fill(tokenAddress);
      await expect
        .poll(async () => (await addressInput.inputValue()).toLowerCase(), {
          timeout: 5_000,
          intervals: [250, 500, 1_000]
        })
        .toBe(tokenAddress.toLowerCase());
      return;
    }

    await expect(addressInput).toHaveAttribute('readonly', 'readonly', { timeout: 5_000 });
    await addressInput.click();

    const deleteTokenModal = page.locator('#admin-delete-token-modal');
    await expect(deleteTokenModal).toHaveClass(/show/, { timeout: 5_000 });
    await expect(deleteTokenModal.locator('#admin-delete-token-list')).toBeVisible({ timeout: 5_000 });

    const deleteTokenRow = deleteTokenModal
      .locator('#admin-delete-token-list .token-item', {
        has: page.locator('.admin-token-address-inline', { hasText: new RegExp(tokenAddress, 'i') })
      })
      .first();
    await expect(deleteTokenRow).toBeVisible({ timeout: 5_000 });
    await deleteTokenRow.click();

    await expect(deleteTokenModal).not.toHaveClass(/show/, { timeout: 5_000 });
    await expect
      .poll(async () => (await addressInput.inputValue()).toLowerCase(), {
        timeout: 5_000,
        intervals: [250, 500, 1_000]
      })
      .toBe(tokenAddress.toLowerCase());
  }).toPass({
    timeout: 30_000,
    intervals: [500, 1_000, 2_000]
  });
};

const submitAllowedTokensUpdate = async (page: Page) => {
  const updateButton = page.locator('#admin-update-tokens');
  await expect(updateButton).toBeVisible({ timeout: 20_000 });
  await expect(updateButton).toBeEnabled({ timeout: 20_000 });
  await updateButton.click();
  await expect(updateButton).toHaveText('Updating...', { timeout: 10_000 });
  await expect(updateButton).toHaveText('Update Allowed Tokens', { timeout: 20_000 });
  await expect(
    page
      .locator('.toast.toast-success .toast-message')
      .filter({ hasText: 'Allowed tokens updated.' })
      .first()
  ).toBeVisible({ timeout: 20_000 });
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
  test('owner sees create order selectors reflect allowed-token delete without page reload', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await page.goto(`/?chain=${chainQuery}`);
    await hardhatWallet.switchAccount(page, OWNER);
    await connectWalletFromUi(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(OWNER), { timeout: 20_000 });

    await expect
      .poll(async () => readIsAllowedToken(whaleSwapAddress, TOKEN_TO_TOGGLE), {
        timeout: 30_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    const adminTabButton = page.locator('.tab-button[data-tab="admin"]');
    await expect(adminTabButton).toBeVisible({ timeout: 20_000 });
    await adminTabButton.click();
    await expect(page.locator('#admin-update-tokens')).toBeVisible();

    await setAdminTokenUpdateRow(page, 'delete', TOKEN_TO_TOGGLE);
    await expectAdminTokenRowAddress(page, TOKEN_TO_TOGGLE);
    await submitAllowedTokensUpdate(page);

    await expect
      .poll(async () => (await readIsAllowedToken(whaleSwapAddress, TOKEN_TO_TOGGLE)) === false, {
        timeout: 45_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(true);

    await page.locator('.tab-button[data-tab="create-order"]').click();
    await expect(page.locator('#buyTokenSelector')).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(async () => {
        const symbols = await readBuyTokenSymbols(page);
        return symbols.includes('LTKB');
      }, {
        timeout: 30_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(false);
  });

  test('owner can remove and re-add an allowed token reflected in create order selectors', async ({ page, hardhatWallet }) => {
    test.setTimeout(180_000);

    await page.goto(`/?chain=${chainQuery}`);
    await hardhatWallet.switchAccount(page, OWNER);
    await connectWalletFromUi(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(OWNER), { timeout: 20_000 });

    const adminTabButton = page.locator('.tab-button[data-tab="admin"]');
    await expect(adminTabButton).toBeVisible({ timeout: 20_000 });
    await adminTabButton.click();
    await expect(page.locator('#admin-update-tokens')).toBeVisible();

    await setAdminTokenUpdateRow(page, 'delete', TOKEN_TO_TOGGLE);
    await expectAdminTokenRowAddress(page, TOKEN_TO_TOGGLE);
    await submitAllowedTokensUpdate(page);

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
    await submitAllowedTokensUpdate(page);

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
