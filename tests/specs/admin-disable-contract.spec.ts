import { test, expect } from '../fixtures/testWithMockWallet';
import type { Dialog, Page } from '@playwright/test';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { readIsDisabled, readNextOrderId } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;
const whaleSwapAddress = localDeployment.contracts.otcSwap;
const OWNER = localDeployment.deployer.toLowerCase();
const MAKER = localDeployment.fundedAccounts.maker.toLowerCase();

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const waitForAppReady = async (page: Page) => {
  const loader = page.locator('#app-bootstrap-loader');
  if ((await loader.count()) > 0) {
    await expect(loader).toBeHidden({ timeout: 30_000 });
  }
};

const disableContractAsOwner = async (
  page: Page,
  hardhatWallet: { switchAccount: (page: Page, account: string) => Promise<string> }
) => {
  await page.goto(`/?chain=${chainQuery}`);
  await waitForAppReady(page);
  await hardhatWallet.switchAccount(page, OWNER);
  await page.locator('#walletConnect').click();
  await expect(page.locator('#accountAddress')).toHaveText(shortAddress(OWNER), { timeout: 15_000 });

  const adminTabButton = page.locator('.tab-button[data-tab="admin"]');
  await expect(adminTabButton).toBeVisible({ timeout: 20_000 });
  await adminTabButton.click();

  const disableButton = page.locator('#admin-disable-contract');
  await expect(disableButton).toBeVisible();
  await expect(disableButton).toHaveText('Disable New Orders Permanently');
  await expect(disableButton).toBeEnabled();

  const confirmDialogPromise = new Promise<{ type: string; message: string }>((resolve) => {
    page.once('dialog', async (dialog: Dialog) => {
      const details = {
        type: dialog.type(),
        message: dialog.message()
      };
      await dialog.accept();
      resolve(details);
    });
  });

  await disableButton.click();
  const confirmDialog = await confirmDialogPromise;
  expect(confirmDialog.type).toBe('confirm');
  expect(confirmDialog.message).toContain('Disabling new orders is permanent');

  await expect
    .poll(async () => readIsDisabled(whaleSwapAddress), {
      timeout: 45_000,
      intervals: [500, 1_000, 2_000]
    })
    .toBe(true);
};

test.describe('WhaleSwap admin disable contract', () => {
  test('owner can permanently disable new orders', async ({ page, hardhatWallet }) => {
    await expect(readIsDisabled(whaleSwapAddress)).resolves.toBe(false);
    await disableContractAsOwner(page, hardhatWallet);

    await expect(
      page
        .locator('.toast.toast-success .toast-message')
        .filter({ hasText: 'New orders are now permanently disabled.' })
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('create-order submission is blocked when contract is disabled', async ({ page, hardhatWallet }) => {
    await expect(readIsDisabled(whaleSwapAddress)).resolves.toBe(false);
    await disableContractAsOwner(page, hardhatWallet);

    const nextOrderIdBefore = await readNextOrderId(whaleSwapAddress);

    await hardhatWallet.switchAccount(page, MAKER);
    await page.reload();
    await waitForAppReady(page);
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(MAKER), { timeout: 15_000 });

    const createOrderTabButton = page.locator('.tab-button[data-tab="create-order"]');
    await expect(createOrderTabButton).toBeVisible({ timeout: 20_000 });
    await createOrderTabButton.click();

    const createOrderBtn = page.locator('#createOrderBtn');
    await expect(createOrderBtn).toBeVisible({ timeout: 20_000 });
    await expect(createOrderBtn).toHaveText('New Orders Disabled');
    await expect(createOrderBtn).toBeDisabled();

    const sellTokenSelector = page.locator('#sellTokenSelector');
    if ((await sellTokenSelector.count()) > 0) {
      await sellTokenSelector.click();
    }

    await expect
      .poll(async () => readNextOrderId(whaleSwapAddress), {
        timeout: 10_000,
        intervals: [500, 1_000, 2_000]
      })
      .toBe(nextOrderIdBefore);
  });
});
