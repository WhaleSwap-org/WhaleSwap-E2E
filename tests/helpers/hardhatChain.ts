import { e2eConfig } from '../../e2e.config';

const NEXT_ORDER_ID_SELECTOR = '0x2a58b330';
const FIRST_ORDER_ID_SELECTOR = '0x071c926e';
const ORDER_EXPIRY_SELECTOR = '0x9008bae8';
const GRACE_PERIOD_SELECTOR = '0xc1a287e2';
const FEE_TOKEN_SELECTOR = '0x647846a5';
const ORDER_CREATION_FEE_AMOUNT_SELECTOR = '0xbaba79e9';
const IS_DISABLED_SELECTOR = '0x6c57f5a9';
const ALLOWED_TOKENS_SELECTOR = '0xe744092e';
const ORDERS_SELECTOR = '0xa85c38ef';
const BALANCE_OF_SELECTOR = '0x70a08231';
const ALLOWANCE_SELECTOR = '0xdd62ed3e';
const ACCUMULATED_FEES_BY_TOKEN_SELECTOR = '0xb4f62e2a';
const CLAIMABLE_SELECTOR = '0xd4570c1c';
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

export const readFirstOrderId = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: FIRST_ORDER_ID_SELECTOR }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const readOrderExpiry = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: ORDER_EXPIRY_SELECTOR }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const readGracePeriod = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: GRACE_PERIOD_SELECTOR }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const readFeeToken = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<string> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: FEE_TOKEN_SELECTOR }, 'latest'], rpcUrl);
  return `0x${result.replace(/^0x/, '').slice(24)}`.toLowerCase();
};

export const readOrderCreationFeeAmount = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const result = await rpcCall<string>(
    'eth_call',
    [{ to: whaleSwapAddress, data: ORDER_CREATION_FEE_AMOUNT_SELECTOR }, 'latest'],
    rpcUrl
  );
  return BigInt(result);
};

export const readIsDisabled = async (
  whaleSwapAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<boolean> => {
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data: IS_DISABLED_SELECTOR }, 'latest'], rpcUrl);
  return BigInt(result) !== 0n;
};

export const readIsAllowedToken = async (
  whaleSwapAddress: string,
  tokenAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<boolean> => {
  const data = `${ALLOWED_TOKENS_SELECTOR}${encodeAddress(tokenAddress)}`;
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data }, 'latest'], rpcUrl);
  return BigInt(result) !== 0n;
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

export const readClaimable = async (
  whaleSwapAddress: string,
  user: string,
  tokenAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const data = `${CLAIMABLE_SELECTOR}${encodeAddress(user)}${encodeAddress(tokenAddress)}`;
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data }, 'latest'], rpcUrl);
  return BigInt(result);
};

export const readAccumulatedFeesByToken = async (
  whaleSwapAddress: string,
  tokenAddress: string,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<bigint> => {
  const data = `${ACCUMULATED_FEES_BY_TOKEN_SELECTOR}${encodeAddress(tokenAddress)}`;
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data }, 'latest'], rpcUrl);
  return BigInt(result);
};

export type OnChainOrder = {
  maker: string;
  taker: string;
  sellToken: string;
  sellAmount: bigint;
  buyToken: string;
  buyAmount: bigint;
  timestamp: bigint;
  status: number;
  feeToken: string;
  orderCreationFee: bigint;
  exists: boolean;
};

const parseAddressWord = (word: string) => `0x${word.slice(24)}`.toLowerCase();
const parseUintWord = (word: string) => BigInt(`0x${word}`);

export const readOrder = async (
  whaleSwapAddress: string,
  orderId: bigint,
  rpcUrl: string = e2eConfig.mockWalletRpcUrl
): Promise<OnChainOrder> => {
  const data = `${ORDERS_SELECTOR}${encodeUint256(orderId)}`;
  const result = await rpcCall<string>('eth_call', [{ to: whaleSwapAddress, data }, 'latest'], rpcUrl);
  const payload = result.replace(/^0x/, '').padEnd(64 * 10, '0');

  const word = (index: number) => payload.slice(index * 64, (index + 1) * 64);

  const maker = parseAddressWord(word(0));
  const parsed = {
    maker,
    taker: parseAddressWord(word(1)),
    sellToken: parseAddressWord(word(2)),
    sellAmount: parseUintWord(word(3)),
    buyToken: parseAddressWord(word(4)),
    buyAmount: parseUintWord(word(5)),
    timestamp: parseUintWord(word(6)),
    status: Number(parseUintWord(word(7))),
    feeToken: parseAddressWord(word(8)),
    orderCreationFee: parseUintWord(word(9)),
    exists: maker !== '0x0000000000000000000000000000000000000000'
  } satisfies OnChainOrder;

  return parsed;
};

export const mineBlock = async (rpcUrl: string = e2eConfig.mockWalletRpcUrl): Promise<void> => {
  await rpcCall('evm_mine', [], rpcUrl);
};

export const increaseTime = async (seconds: bigint | number, rpcUrl: string = e2eConfig.mockWalletRpcUrl): Promise<void> => {
  await rpcCall('evm_increaseTime', [Number(seconds)], rpcUrl);
  await mineBlock(rpcUrl);
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
