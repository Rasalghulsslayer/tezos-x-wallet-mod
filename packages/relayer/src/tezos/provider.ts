import EventEmitter from 'eventemitter3';
import { TezlinkClient } from './tezlink.js';
import { buildTezosToEvmCall, UnknownSelectorError, SubMutezPrecisionError } from '../use-cases/build-tezos-to-evm-call.js';
import { deriveEvmAlias } from '../use-cases/derive-alias.js';
import { l1OpHashToEvmHash } from '../use-cases/build-synthetic-receipt.js';
import { findRealHash } from '../use-cases/resolve-synthetic-hash.js';
import { devLog } from '../shared/log.js';
import type { ITezosWalletClient } from '../ports/tezos-wallet-client.js';
import type {
  EIP1193Provider,
  RequestArguments,
  ProviderRpcError,
  ProviderConnectInfo,
} from '../domain/eip-1193.js';
import type { EthTransactionRequest } from '../domain/eth-tx.js';
import type { PendingOpView } from '../domain/cross-runtime.js';

interface RelayerSession {
  tz1Address: string;
  evmAlias:   string;
  chainId:    string;
}

interface PendingOp {
  l1OpHash:       string;
  from:           string;    // EVM alias of the sender (informational)
  to:             string;    // destination address — matched against the
                              // synthesized tx's `to` to correlate
  value:          string;    // 0x-prefixed wei the user requested — matched
                              // against the synthesized tx's `value`
  fromBlock:      string;    // 0x-prefixed hex: EVM block number at send time
  broadcastedAt:  number;    // Date.now() at submission, exposed via listPendingOps
  realHash?:      string;    // cached real EVM tx hash once resolved
}

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
        devLog.info('[TezosX Relayer] proxy →', args.method, args.params);
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
    return BigInt(chainId).toString();
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

    devLog.info('[TezosX Relayer] eth_sendTransaction →', { to: tx.to, value: tx.value ?? '0x0', data: tx.data ?? '0x' });

    let entrypoint: string;
    let michelineArg: import('@taquito/rpc').MichelsonV1Expression;
    let mutezAmount: bigint;
    try {
      ({ entrypoint, michelineArg, mutezAmount } = await buildTezosToEvmCall(tx));
    } catch (err) {
      if (err instanceof UnknownSelectorError || err instanceof SubMutezPrecisionError) {
        throw rpcError(JSON_RPC_INVALID_PARAMS, err.message);
      }
      throw err;
    }
    devLog.info('[TezosX Relayer] NAC call built →', { entrypoint, mutezAmount });

    // Record the EVM head block BEFORE submission — used later by the resolver
    // to bound the search for the real (kernel-synthesized) EVM transaction.
    const fromBlock = await this.tezlink.blockNumber();
    devLog.info('[TezosX Relayer] fromBlock snapshot →', fromBlock);

    // Submit to Temple via Beacon — opens signing popup
    const l1OpHash = await this.beacon.sendContractCall(entrypoint, michelineArg, mutezAmount.toString());
    devLog.info('[TezosX Relayer] L1 opHash signed →', l1OpHash);

    // Derive a stable 32-byte EVM-style hash from the L1 opHash
    const syntheticHash = l1OpHashToEvmHash(l1OpHash);
    devLog.info('[TezosX Relayer] synthetic EVM hash →', syntheticHash);

    // Store for receipt resolution
    this.pendingOps.set(syntheticHash, {
      l1OpHash,
      from:          this.session.evmAlias,
      to:            tx.to,
      value:         tx.value ?? '0x0',
      fromBlock,
      broadcastedAt: Date.now(),
    });

    return syntheticHash;
  }

  /**
   * Public façade over `resolveRealHash`. Awaits the kernel-synthesized EVM
   * hash that matches a synthetic NAC hash; returns null if the resolver
   * times out. Used by wallet UIs that want to render the real hash before
   * showing "Done" instead of a synthetic placeholder.
   */
  async resolveSyntheticHash(syntheticHash: string): Promise<string | null> {
    return this.resolveRealHash(syntheticHash);
  }

  /** Returns the underlying L1 op hash for a synthetic NAC hash, if any. */
  getPendingL1Hash(syntheticHash: string): string | null {
    return this.pendingOps.get(syntheticHash)?.l1OpHash ?? null;
  }

  /** Snapshot of currently-pending L1→L2 ops (broadcast, kernel not yet resolved). */
  listPendingOps(): readonly PendingOpView[] {
    const out: PendingOpView[] = [];
    for (const op of this.pendingOps.values()) {
      if (op.realHash != null) continue;
      out.push({
        l1OpHash:      op.l1OpHash,
        evmAlias:      op.from,
        to:            op.to,
        fromBlock:     op.fromBlock,
        broadcastedAt: op.broadcastedAt,
      });
    }
    return out;
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
      { to: pending.to, value: pending.value, senderAlias: pending.from },
      pending.fromBlock,
      this.claimedRealHashes,
    ).then((hash) => {
      this.inFlightResolutions.delete(syntheticHash);
      if (hash != null) {
        pending.realHash = hash;
        devLog.info('[TezosX Relayer] real EVM hash resolved →', hash);
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
    devLog.info('[TezosX Relayer] eth_getTransactionByHash →', syntheticHash);

    // Fast path: if we have no pending op for this hash, proxy as-is.
    if (!this.pendingOps.has(syntheticHash)) {
      devLog.info('[TezosX Relayer] unknown synthetic hash, proxying to Tezlink');
      return this.tezlink.proxy('eth_getTransactionByHash', [syntheticHash]);
    }

    devLog.info('[TezosX Relayer] scanning blocks for real EVM tx…');
    const realHash = await this.resolveRealHash(syntheticHash);
    if (realHash == null) {
      // Per EIP-1474, a submitted-but-unmined tx is "pending" — a tx object
      // with blockNumber: null — not `null` (which means "unknown hash" and
      // makes ethers/viem pollers abort or throw). Synthesise a pending tx
      // from the stored op so tx.wait() keeps polling.
      devLog.info('[TezosX Relayer] real tx not mined yet, returning pending tx object');
      const op = this.pendingOps.get(syntheticHash)!;
      return {
        hash:             syntheticHash,
        blockHash:        null,
        blockNumber:      null,
        transactionIndex: null,
        from:             op.from,
        to:               op.to,
        value:            '0x0',
        gas:              '0x0',
        gasPrice:         '0x0',
        input:            '0x',
        nonce:            '0x0',
        type:             '0x2',
        chainId:          this.session?.chainId ?? '0x0',
        v:                '0x0',
        r:                '0x0',
        s:                '0x0',
      };
    }

    devLog.info('[TezosX Relayer] proxying getTransactionByHash with real hash →', realHash);
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
    devLog.info('[TezosX Relayer] eth_getTransactionReceipt →', syntheticHash);

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

    // Per JSON-RPC spec, `eth_getTransactionReceipt` returns `null` for
    // transactions that have been submitted but not yet mined.
    devLog.warn('[TezosX Relayer] real tx not found, returning null →', syntheticHash);
    return null;
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
