import EventEmitter from 'eventemitter3';
import { BeaconClient } from './beacon.js';
import { TezlinkClient } from './tezlink.js';
import { GatewayBuilder } from './gateway.js';
import { deriveEvmAlias } from './utils/derive.js';
import { l1OpHashToEvmHash, buildSyntheticReceipt, pollForReceipt } from './utils/receipt.js';
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

  private readonly beacon  = new BeaconClient();
  private readonly tezlink = new TezlinkClient();
  private readonly gateway = new GatewayBuilder();

  constructor() {
    super();

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

      case 'eth_sendTransaction':
        return this.handleSendTransaction(args);

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

    // Build NAC gateway Micheline call (async: may resolve selector via 4byte.directory)
    const { entrypoint, michelineArg, mutezAmount } = await this.gateway.fromEthTransaction(tx);

    // Submit to Temple via Beacon — opens signing popup
    const l1OpHash = await this.beacon.sendContractCall(entrypoint, michelineArg, mutezAmount);

    // Derive a stable 32-byte EVM-style hash from the L1 opHash
    const syntheticHash = l1OpHashToEvmHash(l1OpHash);

    // Store for receipt resolution
    this.pendingOps.set(syntheticHash, {
      l1OpHash,
      from: this.session.evmAlias,
      to:   tx.to,
    });

    return syntheticHash;
  }

  private async handleGetTransactionReceipt(
    args: RequestArguments,
  ): Promise<unknown> {
    const params = args.params;
    if (!Array.isArray(params) || typeof params[0] !== 'string') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_getTransactionReceipt: expected [txHash]');
    }
    const syntheticHash = params[0];

    // Try the Tezlink EVM node first (may have indexed it already)
    const evmReceipt = await this.tezlink.getTransactionReceipt(syntheticHash);
    if (evmReceipt != null) return evmReceipt;

    // If we don't know this op, nothing to do
    const pending = this.pendingOps.get(syntheticHash);
    if (pending == null) return null;

    // Poll Tezlink for the real receipt (cross-runtime indexing may be delayed)
    const realReceipt = await pollForReceipt(this.tezlink, syntheticHash, 10, 2000);
    if (realReceipt != null) return realReceipt;

    // Last resort: synthetic receipt so dApps don't hang indefinitely
    return buildSyntheticReceipt(syntheticHash, pending.from, pending.to);
  }

  private async handleDisconnect(): Promise<null> {
    this.session = null;
    this.pendingOps.clear();
    await this.beacon.disconnect();
    this.emit('accountsChanged', []);
    this.emit('disconnect', rpcError(EIP1193_UNAUTHORIZED, 'Wallet disconnected'));
    return null;
  }
}
