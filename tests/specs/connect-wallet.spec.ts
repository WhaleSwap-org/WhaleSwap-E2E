import { test, expect } from '../fixtures/testWithMockWallet';
import { e2eConfig } from '../../e2e.config';
import { connectWalletFromUi } from '../helpers/uiReady';

const chainQuery = e2eConfig.chainQuery;
const shortenAddress = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

test.describe('WhaleSwap local wallet flow', () => {
  test('connects wallet from UI and shows connected account', async ({ page, hardhatWallet }) => {
    await page.goto(`/?chain=${chainQuery}`);

    await connectWalletFromUi(page);

    const accountAddress = page.locator('#accountAddress');
    await expect(accountAddress).toBeVisible({ timeout: 15_000 });
    await expect(accountAddress).toHaveText(shortenAddress(hardhatWallet.account));
  });

  test('local network option is visible on localhost', async ({ page }) => {
    await page.goto('/?chain=local');

    const networkButton = page.locator('.network-button');
    await networkButton.click();

    const localOption = page.locator('.network-option[data-slug="local"]');
    await expect(localOption).toBeVisible();
  });
});
