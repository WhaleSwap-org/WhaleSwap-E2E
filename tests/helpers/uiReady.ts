import { expect, type Page } from '@playwright/test';

const DEFAULT_TIMEOUT_MS = 30_000;

export const waitForAppReady = async (page: Page, timeout = DEFAULT_TIMEOUT_MS) => {
  const loader = page.locator('#app-bootstrap-loader');
  if ((await loader.count()) > 0) {
    await expect(loader).toBeHidden({ timeout });
  }
};

export const waitForAppSettled = async (page: Page, timeout = DEFAULT_TIMEOUT_MS) => {
  await expect(page.locator('#accountAddress')).toBeVisible({ timeout });

  await expect
    .poll(async () => {
      const overlayVisible = await page
        .locator('.tab-content.active .loading-overlay')
        .isVisible()
        .catch(() => false);

      const isReinitializing = await page.evaluate(() => {
        const app = (window as Window & { app?: { isReinitializing?: boolean } }).app;
        return Boolean(app?.isReinitializing);
      });
      return !overlayVisible && !isReinitializing;
    }, {
      timeout,
      intervals: [250, 500, 1_000, 2_000]
    })
    .toBe(true);
};

export const connectWalletFromUi = async (page: Page, timeout = DEFAULT_TIMEOUT_MS) => {
  await waitForAppReady(page, timeout);
  const walletConnect = page.locator('#walletConnect');
  await expect(walletConnect).toBeVisible({ timeout });
  await expect(walletConnect).toBeEnabled({ timeout });
  await walletConnect.click();
  await waitForAppSettled(page, timeout);
};
