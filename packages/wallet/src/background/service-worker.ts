import '@/lib/buffer-shim';
import { RelayerProvider } from '@tezosx/relayer/provider';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import { Keyring } from './keyring';
import { LocalSignerClient } from './signer';
import { ApprovalQueue } from './approval-queue';
import { sessionStore } from '../lib/storage';
import { detectRuntime } from '../lib/address';
import type {
  ApproveRequest,
  ContentPush,
  EthereumRequest,
  PopupRequest,
  StoredSession,
  VaultState,
  WalletResponse,
} from '../lib/messages';

// ── Global state (cleared on SW kill) ─────────────────────────────────────────

const keyring  = new Keyring();
const queue    = new ApprovalQueue();
let   signer:   LocalSignerClient | null = null;
let   provider: RelayerProvider | null   = null;
let   evmAlias: string | null            = null;

// ── Derived helpers ───────────────────────────────────────────────────────────

async function currentVaultState(): Promise<VaultState> {
  const hasVault = await keyring.hasVault();
  if (!hasVault) return { status: 'empty' };

  const unlocked = keyring.getUnlocked();
  if (unlocked == null) return { status: 'locked' };

  const alias = evmAlias ?? await deriveEvmAlias(unlocked.tz1);
  evmAlias = alias;
  return { status: 'unlocked', tz1: unlocked.tz1, evmAlias: alias };
}

function rebuildProviderForUnlockedKey(): void {
  const unlocked = keyring.getUnlocked();
  if (unlocked == null) {
    signer   = null;
    provider = null;
    evmAlias = null;
    return;
  }
  signer = new LocalSignerClient(
    unlocked.secretKey,
    unlocked.publicKey,
    unlocked.tz1,
  );
  provider = new RelayerProvider(signer);

  // Forward every provider event to all tabs hosting a connected origin.
  provider.on('accountsChanged', (accounts: string[]) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'accountsChanged', data: accounts }),
  );
  provider.on('chainChanged', (chainId: string) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'chainChanged', data: chainId }),
  );
  provider.on('connect', (info: { chainId: string }) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'connect', data: info }),
  );
  provider.on('disconnect', (err: { code: number; message: string }) =>
    void broadcastEvent({
      type:  'PROVIDER_EVENT',
      event: 'disconnect',
      data:  { code: err.code, message: err.message },
    }),
  );
}

async function broadcastEvent(push: ContentPush): Promise<void> {
  const sessions = await sessionStore.list();
  await Promise.all(
    sessions.map(async ({ origin }) => {
      const tabs = await chrome.tabs.query({ url: `${origin}/*` });
      for (const tab of tabs) {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, push).catch(() => {});
        }
      }
    }),
  );
}

// ── Popup message handler ────────────────────────────────────────────────────

async function handlePopupRequest(msg: PopupRequest): Promise<WalletResponse> {
  try {
    switch (msg.type) {
      case 'GET_STATE':
        return { ok: true, data: await currentVaultState() };

      case 'CREATE_WALLET': {
        await keyring.importFromMnemonic(msg.mnemonic, msg.password);
        rebuildProviderForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'IMPORT_WALLET': {
        await keyring.importFromMnemonic(msg.mnemonic, msg.password);
        rebuildProviderForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'IMPORT_SECRET_KEY': {
        await keyring.importFromSecretKey(msg.edsk, msg.password);
        rebuildProviderForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'UNLOCK': {
        await keyring.unlock(msg.password);
        rebuildProviderForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'LOCK': {
        keyring.lock();
        signer   = null;
        provider = null;
        evmAlias = null;
        queue.rejectAll('wallet locked');
        return { ok: true };
      }

      case 'EXPORT_SEED': {
        const secret = await keyring.exportSecret(msg.password);
        return { ok: true, data: secret };
      }

      case 'LIST_PENDING':
        return { ok: true, data: queue.list() };

      case 'LIST_SESSIONS':
        return { ok: true, data: await sessionStore.list() };

      case 'DISCONNECT':
        await sessionStore.remove(msg.origin);
        return { ok: true };

      case 'SEND_TX': {
        if (signer == null || provider == null) {
          return { ok: false, code: 4100, message: 'Wallet is locked' };
        }

        const dest = detectRuntime(msg.to);

        // Same-runtime XTZ → native Michelson runtime transfer, no NAC gateway.
        if (msg.asset === 'XTZ' && dest === 'l1') {
          const mutez = (BigInt(msg.amount) / 10n ** 12n).toString();
          const opHash = await signer.sendNativeTransfer(msg.to, mutez);
          return { ok: true, data: { runtime: 'l1', hash: opHash } };
        }

        // Cross-runtime XTZ (tz1 → 0x) or USDC → NAC gateway. Returns the
        // synthetic NAC hash; the popup will then poll RESOLVE_TX to get the
        // real kernel-synthesized EVM hash before showing "Done".
        const synthetic = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            to:    msg.to,
            value: msg.amount,       // 0x-prefixed hex wei
            data:  msg.asset === 'XTZ' ? '0x' : msg.amount,
          }],
        }) as string;
        return { ok: true, data: { runtime: 'l2', hash: synthetic } };
      }

      case 'RESOLVE_TX': {
        if (provider == null) {
          return { ok: false, code: 4100, message: 'Wallet is locked' };
        }
        const real = await provider.resolveSyntheticHash(msg.syntheticHash);
        if (real != null) {
          return { ok: true, data: { resolved: true, hash: real } };
        }
        return { ok: true, data: { resolved: false } };
      }

      default:
        return { ok: false, code: -32601, message: `Unknown popup request type` };
    }
  } catch (err) {
    return { ok: false, code: -32603, message: (err as Error).message };
  }
}

// ── Approve.html message handler ─────────────────────────────────────────────

async function handleApproveRequest(msg: ApproveRequest): Promise<WalletResponse> {
  switch (msg.type) {
    case 'GET_PENDING': {
      const pending = queue.get(msg.requestId);
      return pending != null
        ? { ok: true, data: pending }
        : { ok: false, code: -32602, message: 'Pending request not found' };
    }

    case 'RESOLVE_PENDING': {
      const ok = queue.resolve(msg.requestId, msg.decision);
      return ok
        ? { ok: true }
        : { ok: false, code: -32602, message: 'Pending request not found' };
    }
  }
}

// ── Content script message handler (dApp EIP-1193) ───────────────────────────

async function handleEthereumRequest(msg: EthereumRequest): Promise<WalletResponse> {
  const method = msg.args.method;

  // Methods that require user consent before executing
  const needsApproval =
    method === 'eth_requestAccounts' ||
    method === 'eth_sendTransaction';

  if (needsApproval) {
    const unlocked = keyring.getUnlocked();
    if (unlocked == null) {
      return { ok: false, code: 4100, message: 'Wallet is locked' };
    }

    const decision = await queue.enqueue(
      method === 'eth_requestAccounts'
        ? {
            kind:      'connect',
            requestId: msg.requestId,
            origin:    msg.origin,
            createdAt: Date.now(),
          }
        : {
            kind:      'transaction',
            requestId: msg.requestId,
            origin:    msg.origin,
            to:        (msg.args.params as { to: string }[])[0]?.to ?? '',
            value:     (msg.args.params as { value?: string }[])[0]?.value ?? '0x0',
            data:      (msg.args.params as { data?: string }[])[0]?.data ?? '0x',
            createdAt: Date.now(),
          },
    );

    if (decision === 'reject') {
      return { ok: false, code: 4001, message: 'User rejected the request' };
    }
  }

  if (provider == null) {
    return { ok: false, code: 4100, message: 'Wallet is locked' };
  }

  try {
    const result = await provider.request(msg.args);

    if (method === 'eth_requestAccounts') {
      const unlocked = keyring.getUnlocked();
      if (unlocked != null && Array.isArray(result) && typeof result[0] === 'string') {
        const session: StoredSession = {
          origin:      msg.origin,
          tz1Address:  unlocked.tz1,
          evmAlias:    result[0],
          chainId:     await provider.request({ method: 'eth_chainId' }) as string,
          connectedAt: Date.now(),
        };
        await sessionStore.upsert(session);
      }
    }

    return { ok: true, data: result };
  } catch (err) {
    console.error('[TezosX Wallet] handleEthereumRequest error', method, err);
    const e = err as { code?: number; message?: string };
    return { ok: false, code: e.code ?? -32603, message: e.message ?? 'Internal error' };
  }
}

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: PopupRequest | ApproveRequest | EthereumRequest, _sender, sendResponse) => {
    void (async () => {
      if ('type' in msg && (msg.type === 'ETHEREUM_REQUEST')) {
        sendResponse(await handleEthereumRequest(msg));
        return;
      }
      if ('type' in msg && (msg.type === 'GET_PENDING' || msg.type === 'RESOLVE_PENDING')) {
        sendResponse(await handleApproveRequest(msg));
        return;
      }
      sendResponse(await handlePopupRequest(msg as PopupRequest));
    })();
    return true; // keep port open for async
  },
);

chrome.runtime.onInstalled.addListener(() => {
  console.info('[TezosX Wallet] service worker installed, v0.4.1');
});

console.info('[TezosX Wallet] service worker booted');
