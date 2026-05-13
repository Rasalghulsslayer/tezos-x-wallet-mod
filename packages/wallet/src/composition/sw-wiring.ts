/**
 * sw-wiring: the service worker's routing table. dispatch() forwards an
 * incoming chrome.runtime message to the matching use case (or to the
 * EIP-1193 handler for dApp content-script traffic) and wraps the result
 * in a WalletResponse envelope.
 */

import type { Keyring } from '../background/keyring';
import type { ApprovalQueue } from '../background/approval-queue';
import type { Container, PersistentPorts } from './container';
import type {
  ApproveRequest,
  ContentPush,
  EthereumRequest,
  PopupRequest,
  WalletResponse,
} from '../shared/messages';
import type { StoredSession } from '../ports/session-store';

import { getState }                from '../use-cases/get-state';
import { createAccount }           from '../use-cases/create-account';
import { importAccount }           from '../use-cases/import-account';
import { unlockVault }             from '../use-cases/unlock-vault';
import { lockVault }               from '../use-cases/lock-vault';
import { exportSecret }            from '../use-cases/export-secret';
import { listPending }             from '../use-cases/list-pending';
import { listSessions }            from '../use-cases/list-sessions';
import { disconnectOrigin }        from '../use-cases/disconnect-origin';
import { sendTransfer }            from '../use-cases/send-transfer';
import { resolveTx }               from '../use-cases/resolve-tx';
import { getPendingApproval }      from '../use-cases/get-pending-approval';
import { resolvePendingApproval }  from '../use-cases/resolve-pending-approval';

export interface SwState {
  container: Container | null;
  evmAlias:  string | null;
}

export interface SwDeps {
  keyring:          Keyring;
  approvalQueue:    ApprovalQueue;
  persistentPorts:  PersistentPorts;
  state:            SwState;
  rebuildContainer: () => void;
  broadcastEvent:   (push: ContentPush) => Promise<void>;
}

const EIP_UNAUTHORIZED       = 4100;
const EIP_USER_REJECTED      = 4001;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS   = -32602;
const JSON_RPC_INTERNAL         = -32603;

export async function dispatch(
  msg:    PopupRequest | ApproveRequest | EthereumRequest,
  sender: chrome.runtime.MessageSender,
  deps:   SwDeps,
): Promise<WalletResponse> {
  if ('type' in msg && msg.type === 'ETHEREUM_REQUEST') {
    return handleEthereumRequest(msg, deps);
  }
  if ('type' in msg && (msg.type === 'GET_PENDING' || msg.type === 'RESOLVE_PENDING')) {
    if (sender.id !== chrome.runtime.id) {
      return { ok: false, code: EIP_UNAUTHORIZED, message: 'Forbidden sender' };
    }
    return handleApproveRequest(msg, deps);
  }
  return handlePopupRequest(msg as PopupRequest, deps);
}

// ── Popup dispatch ────────────────────────────────────────────────────────────

async function handlePopupRequest(msg: PopupRequest, deps: SwDeps): Promise<WalletResponse> {
  const aliasCache = { value: deps.state.evmAlias };
  const stateDeps  = { keyring: deps.keyring, evmAliasCache: aliasCache };
  const refreshState = async (): Promise<WalletResponse> => {
    const data = await getState(stateDeps);
    deps.state.evmAlias = aliasCache.value;
    return { ok: true, data };
  };

  try {
    switch (msg.type) {
      case 'GET_STATE':
        return refreshState();

      case 'CREATE_WALLET': {
        await createAccount({ mnemonic: msg.mnemonic, password: msg.password }, { keyring: deps.keyring });
        deps.rebuildContainer();
        return refreshState();
      }

      case 'IMPORT_WALLET': {
        await importAccount(
          { source: 'mnemonic', mnemonic: msg.mnemonic, password: msg.password },
          { keyring: deps.keyring },
        );
        deps.rebuildContainer();
        return refreshState();
      }

      case 'IMPORT_SECRET_KEY': {
        await importAccount(
          { source: 'edsk', edsk: msg.edsk, password: msg.password },
          { keyring: deps.keyring },
        );
        deps.rebuildContainer();
        return refreshState();
      }

      case 'UNLOCK': {
        await unlockVault({ password: msg.password }, { keyring: deps.keyring });
        deps.rebuildContainer();
        return refreshState();
      }

      case 'LOCK': {
        lockVault({ keyring: deps.keyring, approvalQueue: deps.approvalQueue });
        deps.state.container = null;
        deps.state.evmAlias  = null;
        return { ok: true };
      }

      case 'EXPORT_SEED': {
        const secret = await exportSecret({ password: msg.password }, { keyring: deps.keyring });
        return { ok: true, data: secret };
      }

      case 'LIST_PENDING':
        return { ok: true, data: listPending({ approvalQueue: deps.approvalQueue }) };

      case 'LIST_SESSIONS':
        return { ok: true, data: await listSessions({ sessionStore: deps.persistentPorts.sessionStore }) };

      case 'DISCONNECT':
        await disconnectOrigin({ origin: msg.origin }, { sessionStore: deps.persistentPorts.sessionStore });
        return { ok: true };

      case 'SEND_TX': {
        if (deps.state.container == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        const result = await sendTransfer(
          { to: msg.to, amount: msg.amount, asset: msg.asset },
          { container: deps.state.container },
        );
        return { ok: true, data: result };
      }

      case 'RESOLVE_TX': {
        if (deps.state.container == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        const result = await resolveTx(
          { syntheticHash: msg.syntheticHash },
          { container: deps.state.container },
        );
        return { ok: true, data: result };
      }

      default:
        return { ok: false, code: JSON_RPC_METHOD_NOT_FOUND, message: `Unknown popup request type` };
    }
  } catch (err) {
    return { ok: false, code: JSON_RPC_INTERNAL, message: (err as Error).message };
  }
}

// ── Approve.html dispatch ─────────────────────────────────────────────────────

function handleApproveRequest(msg: ApproveRequest, deps: SwDeps): WalletResponse {
  switch (msg.type) {
    case 'GET_PENDING': {
      const pending = getPendingApproval({ requestId: msg.requestId }, { approvalQueue: deps.approvalQueue });
      return pending != null
        ? { ok: true, data: pending }
        : { ok: false, code: JSON_RPC_INVALID_PARAMS, message: 'Pending request not found' };
    }
    case 'RESOLVE_PENDING': {
      const ok = resolvePendingApproval(
        { requestId: msg.requestId, decision: msg.decision },
        { approvalQueue: deps.approvalQueue },
      );
      return ok
        ? { ok: true }
        : { ok: false, code: JSON_RPC_INVALID_PARAMS, message: 'Pending request not found' };
    }
  }
}

// ── EIP-1193 dispatch (content script ↔ SW) ───────────────────────────────────

async function handleEthereumRequest(msg: EthereumRequest, deps: SwDeps): Promise<WalletResponse> {
  const method = msg.args.method;

  const needsApproval = method === 'eth_requestAccounts' || method === 'eth_sendTransaction';

  if (needsApproval) {
    const unlocked = deps.keyring.getUnlocked();
    if (unlocked == null) {
      return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
    }

    const decision = await deps.approvalQueue.enqueue(
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
      return { ok: false, code: EIP_USER_REJECTED, message: 'User rejected the request' };
    }
  }

  if (deps.state.container == null) {
    return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
  }

  try {
    const result = await deps.state.container.provider.request(msg.args);

    if (method === 'eth_requestAccounts') {
      const unlocked = deps.keyring.getUnlocked();
      if (unlocked != null && Array.isArray(result) && typeof result[0] === 'string') {
        const session: StoredSession = {
          origin:      msg.origin,
          tz1Address:  unlocked.tz1,
          evmAlias:    result[0],
          chainId:     await deps.state.container.provider.request({ method: 'eth_chainId' }) as string,
          connectedAt: Date.now(),
        };
        await deps.persistentPorts.sessionStore.upsert(session);
      }
    }

    return { ok: true, data: result };
  } catch (err) {
    console.error('[TezosX Wallet] handleEthereumRequest error', method, err);
    const e = err as { code?: number; message?: string };
    return { ok: false, code: e.code ?? JSON_RPC_INTERNAL, message: e.message ?? 'Internal error' };
  }
}
