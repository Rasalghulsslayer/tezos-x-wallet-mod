import EventEmitter from 'eventemitter3';
import { TezlinkClient } from './tezlink.js';
import { GatewayBuilder } from './gateway.js';
import { deriveEvmAlias } from './utils/derive.js';
import { l1OpHashToEvmHash, buildSyntheticReceipt } from './utils/receipt.js';
import { findRealHash } from './utils/resolver.js';
import type { ITezosWalletClient } from './wallet-client.js';
import type {
  EIP1193Provider,
  RequestArguments,
  ProviderRpcError,
  ProviderConnectInfo,
  RelayerSession,
  PendingOp,
  EthTransactionRequest,
} from './types.js';

// ── EIP-1193 error codes ───────────────────────────────────────────────────

const EIP1193_UNAUTHORIZED       = 4100;
const EIP1193_UNSUPPORTED_METHOD = 4200;
const JSON_RPC_INVALID_PARAMS    = -32602;

function rpcError(code: number, message: string, data?: unknown): ProviderRpcError {
  const err = new Error(message) as ProviderRpcError;
  (err as { code: number }).code = code;
  if (data !== undefined) (err as { data: unknown }).data = data;
  return err;
}

// ── RelayerProvider ────────────────────────────────────────────────────────

export class RelayerProvider extends EventEmitter implements EIP1193Provider {
  readonly isMetaMask = false;
  readonly isTezosXRelayer = true;

  private session: RelayerSession | null = null;
  private readonly pendingOps = new Map<string, PendingOp>();
  private readonly claimedRealHashes   = new Set<string>();
  private readonly inFlightResolutions = new Map<string, Promise<string | null>>();

  private readonly beacon:  ITezosWalletClient;
  private readonly tezlink = new TezlinkClient();
  private readonly gateway = new GatewayBuilder();

  /**
   * @param walletClient Wallet backend implementing ITezosWalletClient. Pass
   *                     BeaconClient for Temple integration, or a custom
   *                     LocalSignerClient for a standalone wallet.
   */
  constructor(walletClient: ITezosWalletClient) {
    super();
    this.beacon = walletClient;

    // Restore session if Temple already has an active account (page reload)
    void this.beacon.getActiveAccount().then((account) => {
      if (account == null) return;
      void deriveEvmAlias(account.address).then((evmAlias) => {
        void this.tezlink.getChainId().then((chainId) => {
          this.session = { tz1Address: account.address, evmAlias, chainId };
          this.emit('accountsChanged', [evmAlias]);
          this.emit('connect', { chainId } satisfies ProviderConnectInfo);
        });
      });
    });

    // Forward Temple account changes (user switches account in wallet)
    this.beacon.setAccountChangeHandler((tz1) => {
      if (tz1 == null) {
        this.session = null;
        this.emit('accountsChanged', []);
        this.emit('disconnect', rpcError(EIP1193_UNAUTHORIZED, 'Wallet disconnected'));
        return;
      }
      void deriveEvmAlias(tz1).then((evmAlias) => {
        if (this.session?.evmAlias === evmAlias) return;
        this.session = { ...this.session!, tz1Address: tz1, evmAlias };
        this.emit('accountsChanged', [evmAlias]);
      });
    });
  }

  // ── EIP-1193 request() ───────────────────────────────────────────────────

  async request(args: RequestArguments): Promise<unknown> {
    switch (args.method) {

      case 'eth_requestAccounts':
        return this.handleRequestAccounts();

      case 'eth_accounts':
        return this.session != null ? [this.session.evmAlias] : [];

      case 'tez_getAccounts':
        return this.session != null ? [this.session.tz1Address] : [];

      case 'eth_chainId':
        return this.handleChainId();

      case 'net_version':
        return this.handleNetVersion();

      case 'eth_call':
        return this.handleCall(args);

      case 'eth_getBalance':
        return this.handleGetBalance(args);

      case 'eth_getTransactionCount':
        return this.tezlink.getTransactionCount(
          (args.params as string[])[0],
          (args.params as string[])[1] ?? 'latest',
        );

      // Fees handled by the NAC gateway on L1 — return constants.
      case 'eth_estimateGas':
        return '0x1e8480';
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas':
        return '0x0';
      case 'eth_feeHistory':
        return { oldestBlock: '0x0', baseFeePerGas: ['0x0'], gasUsedRatio: [0], reward: [['0x0']] };

      case 'eth_sendTransaction':
        return this.handleSendTransaction(args);

      case 'eth_getTransactionByHash':
        return this.handleGetTransactionByHash(args);

      case 'eth_getTransactionReceipt':
        return this.handleGetTransactionReceipt(args);

      case 'wallet_revokePermissions':
      case 'wallet_disconnect':
        return this.handleDisconnect();

      // Explicitly unsupported in V1
      case 'eth_sign':
      case 'personal_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4':
        throw rpcError(
          EIP1193_UNSUPPORTED_METHOD,
          `${args.method} is not supported by the Tezos X Relayer`,
        );

      default:
        console.info('[TezosX Relayer] proxy →', args.method, args.params);
        return this.tezlink.proxy(args.method, Array.isArray(args.params) ? args.params : []);
    }
  }

  // ── Private handlers ─────────────────────────────────────────────────────

  private async handleRequestAccounts(): Promise<string[]> {
    // Return existing session without re-prompting
    if (this.session != null) return [this.session.evmAlias];

    const permissions = await this.beacon.requestPermissions();
    const evmAlias    = await deriveEvmAlias(permissions.address);
    const chainId     = await this.tezlink.getChainId();

    this.session = { tz1Address: permissions.address, evmAlias, chainId };

    this.emit('accountsChanged', [evmAlias]);
    this.emit('connect', { chainId } satisfies ProviderConnectInfo);

    return [evmAlias];
  }

  private async handleChainId(): Promise<string> {
    if (this.session?.chainId != null) return this.session.chainId;
    const chainId = await this.tezlink.getChainId();
    if (this.session != null) this.session.chainId = chainId;
    return chainId;
  }

  private async handleNetVersion(): Promise<string> {
    const chainId = await this.handleChainId();
    return String(parseInt(chainId, 16));
  }

  private async handleCall(args: RequestArguments): Promise<string> {
    const params = args.params;
    if (!Array.isArray(params) || typeof params[0] !== 'object') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_call: expected [{to, data, ...}, block]');
    }
    const tx    = params[0] as Record<string, string>;
    const block = typeof params[1] === 'string' ? params[1] : 'latest';
    return this.tezlink.call(tx, block);
  }

  private async handleGetBalance(args: RequestArguments): Promise<string> {
    const params = args.params;
    if (!Array.isArray(params) || typeof params[0] !== 'string') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_getBalance: expected [address, block]');
    }
    const address = params[0];
    const block   = typeof params[1] === 'string' ? params[1] : 'latest';
    return this.tezlink.getBalance(address, block);
  }

  private async handleSendTransaction(args: RequestArguments): Promise<string> {
    if (this.session == null) {
      throw rpcError(EIP1193_UNAUTHORIZED, 'Call eth_requestAccounts first');
    }

    const params = args.params;
    if (!Array.isArray(params) || params.length === 0) {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_sendTransaction: missing params');
    }

    const tx = params[0] as EthTransactionRequest;
    if (typeof tx.to !== 'string') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_sendTransaction: missing "to" field');
    }

    console.info('[TezosX Relayer] eth_sendTransaction →', { to: tx.to, value: tx.value ?? '0x0', data: tx.data ?? '0x' });

    // Build NAC gateway Micheline call (async: may resolve selector via 4byte.directory)
    const { entrypoint, michelineArg, mutezAmount } = await this.gateway.fromEthTransaction(tx);
    console.info('[TezosX Relayer] NAC call built →', { entrypoint, mutezAmount });

    // Record the EVM head block BEFORE submission — used later by the resolver
    // to bound the search for the real (kernel-synthesized) EVM transaction.
    const fromBlock = await this.tezlink.blockNumber();
    console.info('[TezosX Relayer] fromBlock snapshot →', fromBlock);

    // Submit to Temple via Beacon — opens signing popup
    const l1OpHash = await this.beacon.sendContractCall(entrypoint, michelineArg, mutezAmount);
    console.info('[TezosX Relayer] L1 opHash signed →', l1OpHash);

    // Derive a stable 32-byte EVM-style hash from the L1 opHash
    const syntheticHash = l1OpHashToEvmHash(l1OpHash);
    console.info('[TezosX Relayer] synthetic EVM hash →', syntheticHash);

    // Store for receipt resolution
    this.pendingOps.set(syntheticHash, {
      l1OpHash,
      from: this.session.evmAlias,
      to:   tx.to,
      fromBlock,
    });

    return syntheticHash;
  }

  /**
   * Resolve the real kernel-synthesized EVM tx hash for a given synthetic
   * hash. Caches the result on the pending op and deduplicates concurrent
   * callers via a per-hash in-flight promise.
   */
  private resolveRealHash(syntheticHash: string): Promise<string | null> {
    const pending = this.pendingOps.get(syntheticHash);
    if (pending == null) return Promise.resolve(null);
    if (pending.realHash != null) return Promise.resolve(pending.realHash);

    const existing = this.inFlightResolutions.get(syntheticHash);
    if (existing != null) return existing;

    const promise = findRealHash(
      this.tezlink,
      pending.from,
      pending.fromBlock,
      this.claimedRealHashes,
    ).then((hash) => {
      this.inFlightResolutions.delete(syntheticHash);
      if (hash != null) {
        pending.realHash = hash;
        console.info('[TezosX Relayer] real EVM hash resolved →', hash);
      }
      return hash;
    });

    this.inFlightResolutions.set(syntheticHash, promise);
    return promise;
  }

  private async handleGetTransactionByHash(args: RequestArguments): Promise<unknown> {
    const params = args.params;
    if (!Array.isArray(params) || typeof params[0] !== 'string') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_getTransactionByHash: expected [txHash]');
    }
    const syntheticHash = params[0];
    console.info('[TezosX Relayer] eth_getTransactionByHash →', syntheticHash);

    // Fast path: if we have no pending op for this hash, proxy as-is.
    if (!this.pendingOps.has(syntheticHash)) {
      console.info('[TezosX Relayer] unknown synthetic hash, proxying to Tezlink');
      return this.tezlink.proxy('eth_getTransactionByHash', [syntheticHash]);
    }

    console.info('[TezosX Relayer] scanning blocks for real EVM tx…');
    const realHash = await this.resolveRealHash(syntheticHash);
    if (realHash == null) {
      console.info('[TezosX Relayer] real tx not mined yet, returning null');
      return null;
    }

    console.info('[TezosX Relayer] proxying getTransactionByHash with real hash →', realHash);
    return this.tezlink.proxy('eth_getTransactionByHash', [realHash]);
  }

  private async handleGetTransactionReceipt(
    args: RequestArguments,
  ): Promise<unknown> {
    const params = args.params;
    if (!Array.isArray(params) || typeof params[0] !== 'string') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_getTransactionReceipt: expected [txHash]');
    }
    const syntheticHash = params[0];
    console.info('[TezosX Relayer] eth_getTransactionReceipt →', syntheticHash);

    // If we don't know this op, proxy as-is (might be a non-NAC tx hash).
    const pending = this.pendingOps.get(syntheticHash);
    if (pending == null) {
      return this.tezlink.proxy('eth_getTransactionReceipt', [syntheticHash]);
    }

    const realHash = await this.resolveRealHash(syntheticHash);
    if (realHash != null) {
      const realReceipt = await this.tezlink.getTransactionReceipt(realHash);
      if (realReceipt != null) return realReceipt;
    }

    // Last resort: synthetic receipt so dApps don't hang indefinitely.
    console.warn('[TezosX Relayer] real tx not found, returning synthetic receipt →', syntheticHash);
    return buildSyntheticReceipt(syntheticHash, pending.from, pending.to);
  }

  private async handleDisconnect(): Promise<null> {
    this.session = null;
    this.pendingOps.clear();
    this.claimedRealHashes.clear();
    this.inFlightResolutions.clear();
    await this.beacon.disconnect();
    this.emit('accountsChanged', []);
    this.emit('disconnect', rpcError(EIP1193_UNAUTHORIZED, 'Wallet disconnected'));
    return null;
  }
}
