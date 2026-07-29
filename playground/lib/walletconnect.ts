import { TEZLINK_EVM_RPC } from './network';

/** Tezos X previewnet EVM chain id — the live RPC answers eth_chainId = 0x1f440. */
export const PREVIEWNET_CHAIN_ID = 128064;
const CHAIN_HEX = `0x${PREVIEWNET_CHAIN_ID.toString(16)}`;

/** Synthetic EIP-6963-style entry so the WalletConnect path renders through the
 *  same provider list / ConnectPanel flow as injected wallets. The empty icon
 *  makes ProviderButton fall back to its generic wallet glyph. */
export const WC_PROVIDER_INFO: Eip6963ProviderInfo = {
  uuid: 'walletconnect-tezosx-mobile',
  name: 'Tezos X Mobile (WalletConnect)',
  rdns: 'org.walletconnect',
  icon: '',
};

type WcUnderlying = Awaited<
  ReturnType<(typeof import('@walletconnect/ethereum-provider'))['EthereumProvider']['init']>
>;

/**
 * EIP-1193 wrapper around @walletconnect/ethereum-provider, shaped so the
 * existing useRelayer flow works against it unchanged:
 *
 * - `eth_requestAccounts` runs the WC pairing (the `wc:` URI is surfaced
 *   through `onPairingUri` for the QR sheet) or returns the persisted session's
 *   accounts instantly on reconnect.
 * - `tez_getAccounts` throws -32601 — the wallet's tz1 is not exposed over WC,
 *   and useRelayer already tolerates method-not-found there.
 * - `eth_chainId` is answered locally as a hex string (the underlying provider
 *   returns a number, and the wallet does not offer the method over WC).
 * - `wallet_revokePermissions` maps to a WC session disconnect.
 * - Everything else passes through: `eth_sendTransaction` reaches the wallet
 *   over the relay; read methods are served by the rpcMap (chain 128064 is not
 *   in Reown's Blockchain API, so the rpcMap is mandatory).
 *
 * The constructor is side-effect-free and the WC SDK is imported lazily on the
 * first request, so no WC code runs during SSR or initial page load.
 */
export class WcProvider implements EIP1193Provider {
  private underlying: WcUnderlying | null = null;
  private initPromise: Promise<WcUnderlying> | null = null;
  private connecting: Promise<void> | null = null;
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(private readonly onPairingUri: (uri: string | null) => void) {}

  private async ensureInit(): Promise<WcUnderlying> {
    if (this.underlying != null) return this.underlying;
    if (this.initPromise == null) {
      this.initPromise = this.doInit().catch((err: unknown) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<WcUnderlying> {
    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
    if (projectId == null || projectId === '') {
      throw new Error(
        'NEXT_PUBLIC_WC_PROJECT_ID is not set — copy playground/.env.example to .env.local and restart next dev',
      );
    }
    const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
    const provider = await EthereumProvider.init({
      projectId,
      // Optional namespaces only: a `chains:` entry would land in
      // requiredNamespaces with the SDK's default required methods (including
      // personal_sign, which the wallet cannot offer for tz1 accounts) and the
      // settlement would fail on the dApp side. The settled session is the
      // intersection with what the wallet supports.
      optionalChains: [PREVIEWNET_CHAIN_ID],
      optionalMethods: ['eth_accounts', 'eth_sendTransaction'],
      optionalEvents: ['accountsChanged', 'chainChanged'],
      rpcMap: { [PREVIEWNET_CHAIN_ID]: TEZLINK_EVM_RPC },
      showQrModal: false,
      metadata: {
        name: 'Tezos X Playground',
        description: 'EIP-1193 playground for Tezos X',
        url: window.location.origin,
        icons: [],
      },
    });

    provider.on('display_uri', (uri: string) => this.onPairingUri(uri));
    provider.on('accountsChanged', (accounts: string[]) => {
      // Defensive: a wallet may emit CAIP-10 ids ('eip155:128064:0x…').
      this.emit('accountsChanged', accounts.map((a) => (a.includes(':') ? a.split(':').pop() ?? a : a)));
    });
    provider.on('chainChanged', (id: string) => {
      this.emit('chainChanged', /^0x/i.test(id) ? id : `0x${Number(id).toString(16)}`);
    });
    // Wallet-side session revoke: useRelayer treats an empty accountsChanged
    // as a full disconnect reset, so reuse that path.
    provider.on('disconnect', () => this.emit('accountsChanged', []));

    this.underlying = provider;
    return provider;
  }

  async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
    switch (method) {
      case 'tez_getAccounts': {
        const err = new Error('Method not found') as Error & { code: number };
        err.code = -32601;
        throw err;
      }

      case 'eth_requestAccounts': {
        const provider = await this.ensureInit();
        if (provider.session == null) {
          this.connecting ??= provider.connect().finally(() => {
            this.connecting = null;
            this.onPairingUri(null);
          });
          await this.connecting;
        }
        return provider.accounts;
      }

      case 'eth_chainId':
        return CHAIN_HEX;

      case 'wallet_revokePermissions': {
        if (this.underlying?.session != null) await this.underlying.disconnect();
        return null;
      }

      default: {
        const provider = await this.ensureInit();
        return provider.request({ method, params });
      }
    }
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    let set = this.listeners.get(event);
    if (set == null) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  removeListener(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(...args);
  }
}
