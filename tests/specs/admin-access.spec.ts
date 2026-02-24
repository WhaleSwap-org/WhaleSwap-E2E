import { test, expect } from '../fixtures/testWithMockWallet';
import { localDeployment } from '../../../whaleswap-ui/js/local-dev.deployment.js';
import { e2eConfig } from '../../e2e.config';

const chainQuery = e2eConfig.chainQuery;

const NON_OWNER = localDeployment.fundedAccounts.maker.toLowerCase();
const OWNER = localDeployment.deployer.toLowerCase();

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

test.describe('WhaleSwap admin access', () => {
  test('admin tab is hidden for non-owner and visible for owner', async ({ page, hardhatWallet }) => {
    await page.goto(`/?chain=${chainQuery}`);
    await page.locator('#walletConnect').click();
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(NON_OWNER), { timeout: 15_000 });

    const adminTabButton = page.locator('.tab-button[data-tab="admin"]');
    await expect(adminTabButton).toBeHidden({ timeout: 20_000 });

    await hardhatWallet.switchAccount(page, OWNER);
    await page.reload();
    await hardhatWallet.connect(page);
    await expect(page.locator('#accountAddress')).toHaveText(shortAddress(OWNER), { timeout: 15_000 });

    await expect(adminTabButton).toBeVisible({ timeout: 20_000 });
    await adminTabButton.click();
    await expect(page.locator('#admin h2.main-heading')).toHaveText('Admin');
    await expect(page.locator('#admin-update-fee')).toBeVisible();
    await expect(page.locator('#admin-update-tokens')).toBeVisible();
    await expect(page.locator('#admin-disable-contract')).toBeVisible();
  });
});
