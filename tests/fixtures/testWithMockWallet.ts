import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { e2eConfig } from '../../e2e.config';

type HardhatWallet = {
  account: string;
  chainId: string;
  rpcUrl: string;
  connect: (page: Page) => Promise<string[]>;
};

type Fixtures = {
  hardhatWallet: HardhatWallet;
  context: BrowserContext;
};

const toHexChainId = (chainId: string) => {
  const normalized = chainId.toLowerCase();
  if (normalized.startsWith('0x')) {
    return normalized;
  }
  return `0x${Number.parseInt(chainId, 10).toString(16)}`;
};

const installHardhatBackedWalletMock = (config: { account: string; chainId: string; rpcUrl: string }) => {
  type JsonRpcError = Error & { code?: number; data?: unknown };
  type Listener = (payload: unknown) => void;

  const globalWindow = window as Window & { ethereum?: unknown };
  const CONNECTED_STORAGE_KEY = '__whaleswap_mock_wallet_connected__';
  const listenerMap = new Map<string, Set<Listener>>();
  const knownChains = new Set([String(config.chainId).toLowerCase()]);
  let connected = localStorage.getItem(CONNECTED_STORAGE_KEY) === 'true';
  let currentChainId = String(config.chainId).toLowerCase();
  let nextId = 1;

  const normalizeChainId = (value: unknown) => {
    const str = String(value || '').toLowerCase();
    if (str.startsWith('0x')) return str;
    return `0x${Number.parseInt(str, 10).toString(16)}`;
  };

  const emit = (event: string, payload: unknown) => {
    const listeners = listenerMap.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors to mirror browser event emitter behavior.
      }
    }
  };

  const rpcRequest = async (method: string, params: unknown[] = []) => {
    const response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: nextId++,
        jsonrpc: '2.0',
        method,
        params
      })
    });

    const json = (await response.json()) as {
      result?: unknown;
      error?: { code?: number; message?: string; data?: unknown };
    };

    if (json.error) {
      const err = new Error(json.error.message || `RPC error for ${method}`) as JsonRpcError;
      err.code = json.error.code;
      err.data = json.error.data;
      throw err;
    }

    return json.result;
  };

  class HardhatBackedEthereumProvider {
    isMetaMask = true;
    _metamask = {
      isUnlocked: async () => true
    };

    get selectedAddress() {
      return connected ? config.account : null;
    }

    get chainId() {
      return currentChainId;
    }

    get networkVersion() {
      return String(Number.parseInt(currentChainId, 16));
    }

    isConnected() {
      return connected;
    }

    on(event: string, handler: Listener) {
      if (!listenerMap.has(event)) {
        listenerMap.set(event, new Set());
      }
      listenerMap.get(event)?.add(handler);
      return this;
    }

    removeListener(event: string, handler: Listener) {
      listenerMap.get(event)?.delete(handler);
      return this;
    }

    off(event: string, handler: Listener) {
      return this.removeListener(event, handler);
    }

    once(event: string, handler: Listener) {
      const onceHandler: Listener = (payload) => {
        this.removeListener(event, onceHandler);
        handler(payload);
      };
      return this.on(event, onceHandler);
    }

    emit(event: string, payload: unknown) {
      emit(event, payload);
      return true;
    }

    enable() {
      return this.request({ method: 'eth_requestAccounts' });
    }

    async request(args: { method?: string; params?: unknown[] } = {}) {
      const method = args.method;
      const params = args.params ?? [];

      if (!method) {
        const err = new Error('Invalid request: method is required') as JsonRpcError;
        err.code = -32600;
        throw err;
      }

      if (method === 'eth_requestAccounts') {
        connected = true;
        localStorage.setItem(CONNECTED_STORAGE_KEY, 'true');
        emit('connect', { chainId: currentChainId });
        emit('accountsChanged', [config.account]);
        return [config.account];
      }

      if (method === 'eth_accounts') {
        return connected ? [config.account] : [];
      }

      if (method === 'eth_chainId') {
        return currentChainId;
      }

      if (method === 'net_version') {
        return String(Number.parseInt(currentChainId, 16));
      }

      if (method === 'wallet_addEthereumChain') {
        const target = (params[0] as { chainId?: string } | undefined)?.chainId;
        if (!target) {
          const err = new Error('wallet_addEthereumChain requires chainId') as JsonRpcError;
          err.code = -32602;
          throw err;
        }
        knownChains.add(normalizeChainId(target));
        return null;
      }

      if (method === 'wallet_switchEthereumChain') {
        const target = (params[0] as { chainId?: string } | undefined)?.chainId;
        if (!target) {
          const err = new Error('wallet_switchEthereumChain requires chainId') as JsonRpcError;
          err.code = -32602;
          throw err;
        }
        const normalized = normalizeChainId(target);
        if (!knownChains.has(normalized)) {
          const err = new Error('Unrecognized chain') as JsonRpcError;
          err.code = 4902;
          throw err;
        }
        currentChainId = normalized;
        emit('chainChanged', currentChainId);
        return null;
      }

      if (method === 'eth_sendTransaction' && params[0]) {
        const tx = params[0] as { from?: string };
        if (!tx.from) {
          tx.from = config.account;
        }
      }

      if (
        method.startsWith('eth_') ||
        method.startsWith('net_') ||
        method.startsWith('web3_') ||
        method.startsWith('debug_') ||
        method.startsWith('txpool_')
      ) {
        return rpcRequest(method, params);
      }

      const err = new Error(`Unsupported wallet method: ${method}`) as JsonRpcError;
      err.code = 4200;
      throw err;
    }
  }

  Object.defineProperty(globalWindow, 'ethereum', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: new HardhatBackedEthereumProvider()
  });

  window.dispatchEvent(new Event('ethereum#initialized'));
};

export const test = base.extend<Fixtures>({
  context: async ({ context }, use) => {
    const account = e2eConfig.mockWalletAccount;
    const chainId = toHexChainId(e2eConfig.mockWalletChainId);
    const rpcUrl = e2eConfig.mockWalletRpcUrl;

    await context.addInitScript(installHardhatBackedWalletMock, {
      account,
      chainId,
      rpcUrl
    });

    await use(context);
  },
  hardhatWallet: async ({}, use) => {
    const account = e2eConfig.mockWalletAccount;
    const chainId = toHexChainId(e2eConfig.mockWalletChainId);
    const rpcUrl = e2eConfig.mockWalletRpcUrl;
    await use({
      account,
      chainId,
      rpcUrl,
      connect: async (page) =>
        page.evaluate(async () =>
          (
            window as unknown as Window & {
              ethereum: { request: (args: { method: string }) => Promise<string[]> };
            }
          ).ethereum.request({
            method: 'eth_requestAccounts'
          })
        )
    });
  }
});

export { expect };
