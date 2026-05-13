import '@/lib/buffer-shim';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import { Keyring } from './keyring';
import { ApprovalQueue } from './approval-queue';
import { detectRuntime } from '../domain/validation';
import { buildContainer, persistentPorts, type Container } from '../composition/container';
import type {
  ApproveRequest,
  ContentPush,
  EthereumRequest,
  PopupRequest,
  VaultState,
  WalletResponse,
} from '../lib/messages';
import type { StoredSession } from '../ports/session-store';

// ── Global state (cleared on SW kill) ─────────────────────────────────────────

void persistentPorts.notifications.setPendingCount(0);

const keyring  = new Keyring(persistentPorts.vaultStore);
const queue    = new ApprovalQueue(persistentPorts.notifications);
let   container: Container | null = null;
let   evmAlias:  string | null    = null;

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

function rebuildContainerForUnlockedKey(): void {
  const unlocked = keyring.getUnlocked();
  if (unlocked == null) {
    container = null;
    evmAlias  = null;
    return;
  }
  container = buildContainer({
    tz1:       unlocked.tz1,
    publicKey: unlocked.publicKey,
    secretKey: unlocked.secretKey,
  });

  // Forward every provider event to all tabs hosting a connected origin.
  container.provider.on('accountsChanged', (accounts: string[]) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'accountsChanged', data: accounts }),
  );
  container.provider.on('chainChanged', (chainId: string) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'chainChanged', data: chainId }),
  );
  container.provider.on('connect', (info: { chainId: string }) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'connect', data: info }),
  );
  container.provider.on('disconnect', (err: { code: number; message: string }) =>
    void broadcastEvent({
      type:  'PROVIDER_EVENT',
      event: 'disconnect',
      data:  { code: err.code, message: err.message },
    }),
  );
}

async function broadcastEvent(push: ContentPush): Promise<void> {
  const sessions = await persistentPorts.sessionStore.list();
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
        rebuildContainerForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'IMPORT_WALLET': {
        await keyring.importFromMnemonic(msg.mnemonic, msg.password);
        rebuildContainerForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'IMPORT_SECRET_KEY': {
        await keyring.importFromSecretKey(msg.edsk, msg.password);
        rebuildContainerForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'UNLOCK': {
        await keyring.unlock(msg.password);
        rebuildContainerForUnlockedKey();
        return { ok: true, data: await currentVaultState() };
      }

      case 'LOCK': {
        keyring.lock();
        container = null;
        evmAlias  = null;
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
        return { ok: true, data: await persistentPorts.sessionStore.list() };

      case 'DISCONNECT':
        await persistentPorts.sessionStore.remove(msg.origin);
        return { ok: true };

      case 'SEND_TX': {
        if (container == null) {
          return { ok: false, code: 4100, message: 'Wallet is locked' };
        }

        const dest = detectRuntime(msg.to);

        // Same-runtime XTZ → native Michelson runtime transfer, no NAC gateway.
        if (msg.asset === 'XTZ' && dest === 'l1') {
          const mutez = (BigInt(msg.amount) / 10n ** 12n).toString();
          const opHash = await container.signer.sendNativeTransfer(msg.to, mutez);
          return { ok: true, data: { runtime: 'l1', hash: opHash } };
        }

        // Cross-runtime XTZ (tz1 → 0x) or USDC → NAC gateway. Returns the
        // synthetic NAC hash; the popup will then poll RESOLVE_TX to get the
        // real kernel-synthesized EVM hash before showing "Done".
        const synthetic = await container.provider.request({
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
        if (container == null) {
          return { ok: false, code: 4100, message: 'Wallet is locked' };
        }
        const real = await container.provider.resolveSyntheticHash(msg.syntheticHash);
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

  if (container == null) {
    return { ok: false, code: 4100, message: 'Wallet is locked' };
  }

  try {
    const result = await container.provider.request(msg.args);

    if (method === 'eth_requestAccounts') {
      const unlocked = keyring.getUnlocked();
      if (unlocked != null && Array.isArray(result) && typeof result[0] === 'string') {
        const session: StoredSession = {
          origin:      msg.origin,
          tz1Address:  unlocked.tz1,
          evmAlias:    result[0],
          chainId:     await container.provider.request({ method: 'eth_chainId' }) as string,
          connectedAt: Date.now(),
        };
        await persistentPorts.sessionStore.upsert(session);
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
  (msg: PopupRequest | ApproveRequest | EthereumRequest, sender, sendResponse) => {
    void (async () => {
      if ('type' in msg && (msg.type === 'ETHEREUM_REQUEST')) {
        sendResponse(await handleEthereumRequest(msg));
        return;
      }
      if ('type' in msg && (msg.type === 'GET_PENDING' || msg.type === 'RESOLVE_PENDING')) {
        if (sender.id !== chrome.runtime.id) {
          sendResponse({ ok: false, code: 4100, message: 'Forbidden sender' });
          return;
        }
        sendResponse(await handleApproveRequest(msg));
        return;
      }
      sendResponse(await handlePopupRequest(msg as PopupRequest));
    })();
    return true; // keep port open for async
  },
);

chrome.runtime.onInstalled.addListener(() => {
  void persistentPorts.notifications.setPendingCount(0);
  console.info('[TezosX Wallet] service worker installed, v0.6.0');
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, pending] of queue.entries()) {
    if (pending.window?.id === windowId) {
      queue.resolve(requestId, 'reject');
    }
  }
});

// Toolbar icon click keeps the popup behavior; the side panel is opt-in.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.warn('[TezosX Wallet] sidePanel unavailable:', err));

console.info('[TezosX Wallet] service worker booted');
