import basicSetup from '../../test/wallet-setup/basic.setup';
import { testWithSynpress } from '@synthetixio/synpress';
import { metaMaskFixtures } from '@synthetixio/synpress/playwright';

export const test = testWithSynpress(metaMaskFixtures(basicSetup));
export { expect } from '@playwright/test';
