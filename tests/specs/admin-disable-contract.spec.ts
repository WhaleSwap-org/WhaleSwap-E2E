import { test, expect } from '../fixtures/testWithMockWallet';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';
import { readIsDisabled } from '../helpers/hardhatChain';

const chainQuery = e2eConfig.chainQuery;
const whaleSwapAddress = localDeployment.contracts.otcSwap;
const OWNER = localDeployment.deployer.toLowerCase();

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

test.describe('WhaleSwap admin disable contract', () => {
  test('owner can permanently disable new orders', async ({ page, hardhatWallet }) => {
    await expect(readIsDisabled(whaleSwapAddress)).resolves.toBe(false);

    await page.goto(`/?chain=${chainQuery}`);
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
      page.once('dialog', async (dialog) => {
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

    await expect(
      page
        .locator('.toast.toast-success .toast-message')
        .filter({ hasText: 'New orders are now permanently disabled.' })
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test.fixme(
    'TODO(frontend): block create-order submission when contract is disabled',
    async () => {
      // Current behavior (known issue): user can proceed through token approvals,
      // then createOrder reverts on-chain with "Contract is disabled".
      // Expected behavior after UI fix: prevent submission before approvals and show a clear UI message.
    }
  );
});
