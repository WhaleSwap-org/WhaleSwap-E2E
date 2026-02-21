import 'dotenv/config';
import { test, expect } from '../fixtures/testWithMetaMask';

const chainQuery = process.env.CHAIN_QUERY || 'local';

test.describe('WhaleSwap local wallet flow', () => {
  test('connects wallet from UI and shows connected account', async ({ page, metamask }) => {
    await page.goto(`/?chain=${chainQuery}`);

    const walletConnect = page.locator('#walletConnect');
    await expect(walletConnect).toBeVisible();
    await walletConnect.click();

    await metamask.connectToDapp();

    const accountAddress = page.locator('#accountAddress');
    await expect(accountAddress).toBeVisible();
    await expect(accountAddress).not.toHaveText('');
  });

  test('local network option is visible on localhost', async ({ page }) => {
    await page.goto('/?chain=local');

    const networkButton = page.locator('.network-button');
    await networkButton.click();

    const localOption = page.locator('.network-option[data-slug="local"]');
    await expect(localOption).toBeVisible();
  });
});
