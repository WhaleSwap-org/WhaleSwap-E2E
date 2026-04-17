import { expect, type Page } from '@playwright/test';

export async function selectTokenBySymbol(
  page: Page,
  type: 'sell' | 'buy',
  tokenSymbol: 'LTKA' | 'LTKB',
  expectedAddress?: string
) {
  await page.locator(`#${type}TokenSelector`).click();

  const item = page
    .locator(`#${type}AllowedTokenList .token-item`, {
      has: page.locator(`.token-item-symbol:text-is("${tokenSymbol}")`)
    })
    .first();
  await expect(item).toBeVisible({ timeout: 15_000 });

  const itemAddress = await item.getAttribute('data-address');
  const resolvedExpectedAddress = (expectedAddress || itemAddress || '').toLowerCase();
  if (!resolvedExpectedAddress) {
    throw new Error(`Missing expected address for ${tokenSymbol}`);
  }

  if (expectedAddress && itemAddress?.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Expected ${tokenSymbol} address ${expectedAddress}, got ${itemAddress || '<missing data-address>'}`
    );
  }

  await item.click();

  await expect
    .poll(
      async () =>
        await page.locator(`#${type}Token`).evaluate((element) => {
          return element instanceof HTMLInputElement ? element.value.toLowerCase() : '';
        }),
      { timeout: 15_000, intervals: [250, 500, 1_000] }
    )
    .toBe(resolvedExpectedAddress);

  await expect(page.locator(`#${type}TokenModal`)).toBeHidden({ timeout: 15_000 });
  await expect(page.locator(`#${type}TokenSelector`)).toContainText(tokenSymbol, { timeout: 15_000 });
}
