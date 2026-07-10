/**
 * sw-wiring: the service worker's routing table. dispatch() takes a message and
 * the transport-neutral ClassifiedSource the host attests for it, enforces the
 * sender guard (privileged commands from the trusted-ui channel only; dApp
 * traffic from the dapp channel with a matching origin), forwards to the
 * matching use case (or the EIP-1193 handler for dApp traffic), and wraps the
 * result in a WalletResponse envelope. It holds no platform coupling — the host
 * shell classifies its native sender before calling in.
 */

import type { Keyring } from '../background/keyring';
import { DuplicateRequestIdError, TooManyPendingRequestsError, type ApprovalQueue } from '../background/approval-queue';
import type { Container, PersistentPorts } from '../ports/container';
import type { ContainerCache } from './container-cache';
import { ensureContainerFor } from './container-builder';
import type {
  ApproveRequest,
  ContentPush,
  EthereumRequest,
  PendingTransaction,
  PopupRequest,
  WalletResponse,
} from '../shared/messages';
import type { StoredSession } from '../ports/session-store';
import type { AccountId } from '../domain/account';
import type { ClassifiedSource } from '../ports/message-source';
import { AccountNotFoundError } from '../domain/vault';

import { getState }                from '../use-cases/get-state';
import { createAccount }           from '../use-cases/create-account';
import { importAccount }           from '../use-cases/import-account';
import { unlockVault }             from '../use-cases/unlock-vault';
import { lockVault }               from '../use-cases/lock-vault';
import { exportSecret }            from '../use-cases/export-secret';
import { exportWalletSeed }        from '../use-cases/export-wallet-seed';
import { listPending }             from '../use-cases/list-pending';
import { listSessions }            from '../use-cases/list-sessions';
import { disconnectOrigin }        from '../use-cases/disconnect-origin';
import { sendTransfer }            from '../use-cases/send-transfer';
import { resolveTx }               from '../use-cases/resolve-tx';
import { listActivity }            from '../use-cases/list-activity';
import { getPendingApproval }      from '../use-cases/get-pending-approval';
import { resolvePendingApproval }  from '../use-cases/resolve-pending-approval';
import { addAccount }              from '../use-cases/add-account';
import { removeAccount }           from '../use-cases/remove-account';
import { setActiveAccount }        from '../use-cases/set-active-account';
import { renameAccount }           from '../use-cases/rename-account';
import { listAccounts }            from '../use-cases/list-accounts';
import { peekCustomToken }         from '../use-cases/peek-custom-token';
import { addCustomToken }          from '../use-cases/add-custom-token';
import { removeCustomToken }       from '../use-cases/remove-custom-token';
import { listRegisteredTokens }    from '../use-cases/list-registered-tokens';
import { TEZLINK_EVM_RPC }         from '@tezosx/relayer/constants';
import { buildTezosToEvmCall, UnknownSelectorError, SubMutezPrecisionError, InvalidDestinationError } from '@tezosx/relayer/use-cases/build-tezos-to-evm-call';

export interface SwState {
  container: Container | null;
  evmAlias:  string | null;
}

export interface SwDeps {
  keyring:          Keyring;
  approvalQueue:    ApprovalQueue;
  persistentPorts:  PersistentPorts;
  state:            SwState;
  containerCache:   ContainerCache;
  rebuildContainer: () => Promise<void>;
  broadcastEvent:   (push: ContentPush) => Promise<void>;
}

const EIP_UNAUTHORIZED       = 4100;
const EIP_USER_REJECTED      = 4001;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS   = -32602;
const JSON_RPC_INTERNAL         = -32603;
const JSON_RPC_LIMIT_EXCEEDED   = -32005;

export async function dispatch(
  msg:    PopupRequest | ApproveRequest | EthereumRequest,
  source: ClassifiedSource,
  deps:   SwDeps,
): Promise<WalletResponse> {
  if ('type' in msg && msg.type === 'ETHEREUM_REQUEST') {
    // dApp traffic must arrive over the untrusted dApp channel, and when the
    // host attests an origin it must match the origin stamped into the
    // envelope. Reject trusted-ui / unrecognized sources so they can't
    // impersonate a dApp, and reject a stamped origin that disagrees with the
    // host-verified one.
    if (
      source == null ||
      source.channel !== 'dapp' ||
      (source.verifiedOrigin != null && source.verifiedOrigin !== msg.origin)
    ) {
      return { ok: false, code: EIP_UNAUTHORIZED, message: 'Forbidden sender' };
    }
    return handleEthereumRequest(msg, deps);
  }

  // Everything else is privileged (unlock, seed export, approval decisions):
  // only the trusted first-party UI surface may issue it. The host attests this
  // channel from facts core can't see (an extension-page URL on Chrome,
  // in-process identity on mobile) — never from anything a dApp can supply.
  if (source == null || source.channel !== 'trusted-ui') {
    return { ok: false, code: EIP_UNAUTHORIZED, message: 'Forbidden sender' };
  }
  if ('type' in msg && (msg.type === 'GET_PENDING' || msg.type === 'RESOLVE_PENDING')) {
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
        await deps.rebuildContainer();
        return refreshState();
      }

      case 'IMPORT_WALLET': {
        await importAccount(
          { source: 'mnemonic', mnemonic: msg.mnemonic, password: msg.password },
          { keyring: deps.keyring },
        );
        await deps.rebuildContainer();
        return refreshState();
      }

      case 'IMPORT_SECRET_KEY': {
        await importAccount(
          { source: 'edsk', edsk: msg.edsk, password: msg.password },
          { keyring: deps.keyring },
        );
        await deps.rebuildContainer();
        return refreshState();
      }

      case 'IMPORT_EVM_PRIVKEY': {
        await importAccount(
          { source: 'evm-privkey', privateKey: msg.privateKey, password: msg.password },
          { keyring: deps.keyring },
        );
        await deps.rebuildContainer();
        return refreshState();
      }

      case 'UNLOCK': {
        await unlockVault({ password: msg.password }, { keyring: deps.keyring, tokenStore: deps.persistentPorts.tokenStore });
        await deps.rebuildContainer();
        return refreshState();
      }

      case 'LOCK': {
        lockVault({ keyring: deps.keyring, approvalQueue: deps.approvalQueue });
        deps.state.container = null;
        deps.state.evmAlias  = null;
        deps.containerCache.clear();
        return { ok: true };
      }

      case 'EXPORT_SEED': {
        const secret = await exportSecret({ password: msg.password, accountId: msg.accountId }, { keyring: deps.keyring });
        return { ok: true, data: secret };
      }

      case 'EXPORT_WALLET_SEED': {
        const mnemonic = await exportWalletSeed({ password: msg.password }, { keyring: deps.keyring });
        return { ok: true, data: mnemonic };
      }

      case 'LIST_PENDING':
        return { ok: true, data: listPending({ approvalQueue: deps.approvalQueue }) };

      case 'LIST_SESSIONS':
        return { ok: true, data: await listSessions({ sessionStore: deps.persistentPorts.sessionStore }) };

      case 'LIST_ACTIVITY': {
        if (deps.state.container == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        const result = await listActivity(
          { cursor: msg.cursor, limit: msg.limit, filter: msg.filter },
          { container: deps.state.container },
        );
        return { ok: true, data: result };
      }

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

      case 'ADD_ACCOUNT': {
        if (deps.keyring.getUnlocked() == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        const result = await addAccount(
          { kind: msg.kind, source: msg.source, label: msg.label },
          { keyring: deps.keyring, tokenStore: deps.persistentPorts.tokenStore },
        );
        return { ok: true, data: result };
      }

      case 'REMOVE_ACCOUNT': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const wasActive = unlocked.account.id === msg.accountId;
        await removeAccount({ accountId: msg.accountId, password: msg.password }, { keyring: deps.keyring });
        deps.containerCache.evict(msg.accountId);
        // A dApp connected with the removed account loses its account: drop
        // that per-origin session and tell only that origin (accountsChanged
        // []). Origins bound to other accounts are untouched — an account
        // operation must not disclose or re-point another origin's account.
        await disconnectRemovedAccountSessions(msg.accountId, deps);
        if (wasActive) {
          aliasCache.value = null;
          await deps.rebuildContainer();
          return refreshState();
        }
        return refreshState();
      }

      case 'SET_ACTIVE_ACCOUNT': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        if (unlocked.account.id === msg.accountId) return refreshState();
        await setActiveAccount({ accountId: msg.accountId }, { keyring: deps.keyring });
        aliasCache.value = null;
        await deps.rebuildContainer();
        // No accountsChanged broadcast: switching the active account (for the
        // user's own Send/Receive) does not change what any connected dApp
        // sees — each origin stays bound to the account it connected with.
        // Broadcasting the new active alias to every origin was the SEC-1 leak.
        return refreshState();
      }

      case 'RENAME_ACCOUNT': {
        if (deps.keyring.getUnlocked() == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        await renameAccount({ accountId: msg.accountId, label: msg.label }, { keyring: deps.keyring });
        return refreshState();
      }

      case 'LIST_ACCOUNTS': {
        if (deps.keyring.getUnlocked() == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        const result = await listAccounts({ keyring: deps.keyring });
        return { ok: true, data: result };
      }

      case 'PEEK_CUSTOM_TOKEN': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const token = await peekCustomToken(
          { accountId: unlocked.account.id, address: msg.address, tryAnyway: msg.tryAnyway },
          { tokenStore: deps.persistentPorts.tokenStore, rpcUrl: TEZLINK_EVM_RPC },
        );
        return { ok: true, data: token };
      }

      case 'ADD_CUSTOM_TOKEN': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const token = await addCustomToken(
          { accountId: unlocked.account.id, address: msg.address, tryAnyway: msg.tryAnyway },
          { tokenStore: deps.persistentPorts.tokenStore, rpcUrl: TEZLINK_EVM_RPC },
        );
        // Rebuild the container so EvmActivityFetcher's tokenList closure
        // picks up the new token on its next poll.
        await deps.rebuildContainer();
        return { ok: true, data: token };
      }

      case 'REMOVE_CUSTOM_TOKEN': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        await removeCustomToken(
          { accountId: unlocked.account.id, address: msg.address },
          { tokenStore: deps.persistentPorts.tokenStore },
        );
        await deps.rebuildContainer();
        return { ok: true };
      }

      case 'LIST_REGISTERED_TOKENS': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const tokens = await listRegisteredTokens(
          { accountId: unlocked.account.id },
          { tokenStore: deps.persistentPorts.tokenStore },
        );
        return { ok: true, data: tokens };
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

  // EIP-1193 requires `eth_accounts` to return [] for origins that have not
  // connected. The wallet's per-origin session, written on `eth_requestAccounts`
  // approval, is the authoritative source — gate at the SW layer so the
  // provider doesn't disclose the active address to unconnected pages.
  if (method === 'eth_accounts') {
    if (deps.keyring.getUnlocked() == null) {
      return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
    }
    const sessions = await deps.persistentPorts.sessionStore.list();
    const session  = sessions.find((s) => s.origin === msg.origin);
    return { ok: true, data: session == null ? [] : [session.evmAlias] };
  }

  // eth_signTypedData (any version) is not implemented by either signer:
  // EvmProvider would fall through to its JSON-RPC proxy — prompting the user
  // to approve a "signature", then forwarding the payload to the public RPC
  // node, which cannot sign it. Refuse before prompting so the user is never
  // asked to approve a signature the wallet cannot produce (and the message
  // never leaves the extension).
  if (method.startsWith('eth_signTypedData')) {
    return { ok: false, code: JSON_RPC_METHOD_NOT_FOUND, message: `${method} is not supported` };
  }

  const needsApproval =
    method === 'eth_requestAccounts'   ||
    method === 'eth_sendTransaction'   ||
    method === 'personal_sign';

  // Signing methods require an active session for the calling origin.
  // `eth_requestAccounts` is the one method that creates a session, so it's
  // exempt. Everything else must go through Connect first.
  const requiresSession =
    method === 'eth_sendTransaction'   ||
    method === 'personal_sign';

  let pinnedAccountId: string | undefined;

  if (needsApproval) {
    const unlocked = deps.keyring.getUnlocked();
    if (unlocked == null) {
      return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
    }

    if (requiresSession) {
      const sessions = await deps.persistentPorts.sessionStore.list();
      const session  = sessions.find((s) => s.origin === msg.origin);
      if (session == null) {
        return {
          ok:      false,
          code:    EIP_UNAUTHORIZED,
          message: 'Origin is not connected. Call eth_requestAccounts first.',
        };
      }
    }

    const accountId = unlocked.account.id;

    let pending: Parameters<typeof deps.approvalQueue.enqueue>[0];
    if (method === 'eth_requestAccounts') {
      pending = {
        kind:      'connect',
        requestId: msg.requestId,
        origin:    msg.origin,
        accountId,
        createdAt: Date.now(),
      };
    } else if (method === 'eth_sendTransaction') {
      const tx = (msg.args.params as { to?: string; value?: string; data?: string }[])[0] ?? {};

      // Tezos-source eth_sendTransaction routes through the NAC gateway: build
      // the Michelson call ahead of approval so the popup can show the
      // resolved target / entrypoint / selector / mutez value. EVM-source
      // sends skip this (handled natively by EvmProvider).
      let crossRuntime: PendingTransaction['crossRuntime'] | undefined;
      let methodSig: string | undefined;
      if (unlocked.account.kind === 'tezos') {
        try {
          const gateway = await buildTezosToEvmCall({
            to:    tx.to ?? '',
            value: tx.value,
            data:  tx.data,
          });
          const calldata    = (tx.data ?? '0x').replace(/^0x/i, '');
          const selectorHex = calldata.length >= 8 ? calldata.slice(0, 8) : '';
          // Prefer the human-readable signature the gateway resolved; fall back
          // to the raw 0x<selector> so the popup shows what 4 bytes were signed.
          const decodedSelector = gateway.entrypoint === 'call_evm'
            ? (gateway.methodSig ?? (selectorHex !== '' ? `0x${selectorHex}` : null))
            : null;
          methodSig = gateway.methodSig;
          crossRuntime = {
            michelsonTarget: gateway.contractAddr,
            entrypoint:      gateway.entrypoint,
            decodedSelector,
            mutezValue:      gateway.mutezAmount.toString(),
          };
        } catch (err) {
          if (err instanceof UnknownSelectorError || err instanceof SubMutezPrecisionError || err instanceof InvalidDestinationError) {
            return { ok: false, code: JSON_RPC_INVALID_PARAMS, message: err.message };
          }
          throw err;
        }
      }

      pending = {
        kind:      'transaction',
        requestId: msg.requestId,
        origin:    msg.origin,
        accountId,
        to:        tx.to ?? '',
        value:     tx.value ?? '0x0',
        data:      tx.data ?? '0x',
        methodSig,
        createdAt: Date.now(),
        crossRuntime,
      };
    } else {
      const params  = msg.args.params as string[];
      const rawHex  = (method === 'personal_sign' ? params[0] : params[1]) ?? '';
      pending = {
        kind:      'signature',
        requestId: msg.requestId,
        origin:    msg.origin,
        accountId,
        message:   rawHex,
        decoded:   tryDecodeUtf8(rawHex),
        createdAt: Date.now(),
      };
    }

    let decision: Awaited<ReturnType<typeof deps.approvalQueue.enqueue>>;
    try {
      decision = await deps.approvalQueue.enqueue(pending);
    } catch (err) {
      if (err instanceof DuplicateRequestIdError) {
        return { ok: false, code: JSON_RPC_INVALID_PARAMS, message: 'Duplicate request id' };
      }
      if (err instanceof TooManyPendingRequestsError) {
        // -32005: limit exceeded (EIP-1474). Rejects the flood without opening
        // yet another popup.
        return { ok: false, code: JSON_RPC_LIMIT_EXCEEDED, message: 'Too many pending requests from this origin' };
      }
      throw err;
    }

    if (decision === 'reject') {
      return { ok: false, code: EIP_USER_REJECTED, message: 'User rejected the request' };
    }
    pinnedAccountId = pending.accountId;
  }

  let container = deps.state.container;
  if (pinnedAccountId != null) {
    try {
      container = await ensureContainerFor(pinnedAccountId, {
        keyring:         deps.keyring,
        containerCache:  deps.containerCache,
        persistentPorts: deps.persistentPorts,
        onProviderEvent: deps.broadcastEvent,
      });
    } catch (err) {
      if (err instanceof AccountNotFoundError) {
        return { ok: false, code: EIP_USER_REJECTED, message: 'The signing account was removed before approval' };
      }
      throw err;
    }
  }
  if (container == null) {
    return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
  }

  try {
    const result = await container.provider.request(msg.args);

    if (method === 'eth_requestAccounts' && pinnedAccountId != null) {
      const account = deps.keyring.listAccounts().find(a => a.id === pinnedAccountId);
      if (account != null && Array.isArray(result) && typeof result[0] === 'string') {
        const session: StoredSession = {
          origin:      msg.origin,
          accountId:   pinnedAccountId,
          tz1Address:  account.kind === 'tezos' ? account.tz1 : '',
          evmAlias:    result[0],
          chainId:     await container.provider.request({ method: 'eth_chainId' }) as string,
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

/**
 * Drop every per-origin session bound to a just-removed account and tell only
 * those origins their account is gone (accountsChanged []). Sessions bound to
 * other accounts — and origins that never connected — are left untouched.
 */
async function disconnectRemovedAccountSessions(accountId: AccountId, deps: SwDeps): Promise<void> {
  const sessions = await deps.persistentPorts.sessionStore.list();
  await Promise.all(
    sessions
      .filter((s) => s.accountId === accountId)
      .map(async (s) => {
        await deps.persistentPorts.sessionStore.remove(s.origin);
        await deps.broadcastEvent({ type: 'PROVIDER_EVENT', event: 'accountsChanged', data: [], origin: s.origin });
      }),
  );
}

// Bidi overrides / embeddings / isolates and zero-width characters: invisible
// or direction-flipping codepoints that let a decoded message read as
// something other than what is signed. If a payload contains any, we refuse to
// present it as clean text (the UI shows the raw hex instead).
const DECEPTIVE_CHARS = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

/** Best-effort utf-8 decode for a hex-encoded signing payload. Returns
 *  undefined when the bytes don't look like plain, non-deceptive text. */
function tryDecodeUtf8(hex: string): string | undefined {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return undefined;
  }
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (DECEPTIVE_CHARS.test(text)) return undefined;
    return /^[\x09\x0a\x0d\x20-\x7e -￿]+$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}
