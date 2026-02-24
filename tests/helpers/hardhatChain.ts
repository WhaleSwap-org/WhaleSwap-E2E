import { e2eConfig } from '../../e2e.config';

const NEXT_ORDER_ID_SELECTOR = '0x2a58b330';
const BALANCE_OF_SELECTOR = '0x70a08231';
const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const APPROVE_SELECTOR = '0x095ea7b3';
const DEFAULT_APPROVAL_AMOUNT = 10n ** 30n;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const rpcCall = async <T>(
  method: string,
  params: unknown[],
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<T> => {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });

  const json = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(`RPC ${method} failed: ${json.error.message || 'unknown error'}`);
  }

  return json.result as T;
};

const encodeAddress = (address: string) => `000000000000000000000000${address.toLowerCase().replace(/^0x/, '')}`;
const encodeUint256 = (value: bigint) => value.toString(16).padStart(64, '0');

export const createSnapshot = async (rpcUrl: string = e2eConfig.mockWalletRpcUrl): Promise<string> => {
  const snapshotId = await rpcCall<string | number>('evm_snapshot', [], rpcUrl);
  return String(snapshotId);
};

export const revertSnapshot = async (
  snapshotId: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<boolean> => {
  const result = await rpcCall<boolean | string>('evm_revert', [snapshotId], rpcUrl);
  return result === true || result === 'true' || result === '0x1' || result === '1';
};

export const readNextOrderId = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: NEXT_ORDER_ID_SELECTOR }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const readBalance = async (
  tokenAddress: string,
  account: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const data = `${BALANCE_OF_SELECTOR}${encodeAddress(account)}`;
  const result = await rpcCall<string>('eth_call', [{ to: tokenAddress, data }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const readAllowance = async (
  tokenAddress: string,
  owner: string,
  spender: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const data = `${ALLOWANCE_SELECTOR}${encodeAddress(owner)}${encodeAddress(spender)}`;
  const result = await rpcCall<string>('eth_call', [{ to: tokenAddress, data }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const waitForReceipt = async (
  txHash: string,
  options?: {
    rpcUrl?: string;
    timeoutMs?: number;
    intervalsMs?: number[];
  }
): Promise<void> => {
  const rpcUrl = options?.rpcUrl || e2eConfig.mockWalletRpcUrl;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const intervalsMs = options?.intervalsMs ?? [250, 500, 1_000];
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < timeoutMs) {
    const receipt = await rpcCall<{ status?: string } | null>('eth_getTransactionReceipt', [txHash], rpcUrl);
    if (receipt?.status === '0x1') {
      return;
    }

    const waitMs = intervalsMs[Math.min(attempt, intervalsMs.length - 1)];
    attempt += 1;
    await sleep(waitMs);
  }

  throw new Error(`Timed out waiting for receipt: ${txHash}`);
};

export const ensureAllowance = async (
  tokenAddress: string,
  owner: string,
  spender: string,
  required: bigint,
  options?: {
    rpcUrl?: string;
    approvalAmount?: bigint;
  }
): Promise<void> => {
  const rpcUrl = options?.rpcUrl || e2eConfig.mockWalletRpcUrl;
  const approvalAmount = options?.approvalAmount ?? DEFAULT_APPROVAL_AMOUNT;
  const current = await readAllowance(tokenAddress, owner, spender, rpcUrl);

  if (current >= required) {
    return;
  }

  const data = `${APPROVE_SELECTOR}${encodeAddress(spender)}${encodeUint256(approvalAmount)}`;
  const txHash = await rpcCall<string>(
    'eth_sendTransaction',
    [
      {
        from: owner,
        to: tokenAddress,
        data
      }
    ],
    rpcUrl
  );

  await waitForReceipt(txHash, { rpcUrl });
};
