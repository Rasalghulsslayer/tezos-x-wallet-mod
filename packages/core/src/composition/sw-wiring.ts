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
  BeaconOperationRequest,
  BeaconPermissionRequest,
  BeaconRequest,
  ContentPush,
  EthereumRequest,
  PendingTransaction,
  PopupRequest,
  WalletResponse,
} from '../shared/messages';
import type { StoredSession } from '../ports/session-store';
import type { Account, AccountId } from '../domain/account';
import type { ClassifiedSource } from '../ports/message-source';
import { AccountNotFoundError } from '../domain/vault';
import {
  BEACON_NETWORK_NOT_SUPPORTED,
  BEACON_NOT_CONNECTED,
  BEACON_NO_ADDRESS,
  BEACON_OPERATION_FAILED,
  WALLET_BEACON_NETWORK,
  checkRequestedNetwork,
  grantScopes,
  type BeaconPermissionGrant,
} from '../domain/beacon';
import { checkOperation, maxOpCostMutez } from '../domain/tezos-operation';

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
import { addContact }              from '../use-cases/add-contact';
import { renameContact }           from '../use-cases/rename-contact';
import { removeContact }           from '../use-cases/remove-contact';
import { listContacts }            from '../use-cases/list-contacts';
import { changePassword }          from '../use-cases/change-password';
import { resetWallet }             from '../use-cases/reset-wallet';
import { TEZLINK_EVM_RPC }         from '@tezosx/relayer/constants';
import { deriveEvmAlias }          from '@tezosx/relayer/utils/derive';
import type { EvmAliasCache }      from '../shared/evm-alias-cache';
import { summariseMicheline, tryDecodeUtf8 } from '../shared/approval-display';
import { buildTezosToEvmCall, UnknownSelectorError, SubMutezPrecisionError, InvalidDestinationError } from '@tezosx/relayer/use-cases/build-tezos-to-evm-call';

export interface SwState {
  container: Container | null;
}

export interface SwDeps {
  keyring:          Keyring;
  approvalQueue:    ApprovalQueue;
  persistentPorts:  PersistentPorts;
  state:            SwState;
  // tz1 → alias entries survive lock (immutable public mapping, not key
  // material) so a relock → unlock cycle stays offline-capable. Cleared on
  // wallet reset only.
  aliasCache:       EvmAliasCache;
  containerCache:   ContainerCache;
  rebuildContainer: () => Promise<void>;
  broadcastEvent:   (push: ContentPush) => Promise<void>;
}

/**
 * Fire-and-forget resolution of the missing tz1 → alias entries. Runs after
 * the state answer is already on its way — the popup is never gated on the
 * network — and single-flights inside the cache. The shells re-poll GET_STATE
 * while an alias is still null, so a completed backfill reaches the UI on the
 * next poll without needing a push channel.
 */
function kickAliasBackfill(deps: SwDeps): void {
  const tz1s = deps.keyring.listAccounts()
    .filter((a) => a.kind === 'tezos')
    .map((a) => a.tz1);
  if (tz1s.length === 0) return;
  void deps.aliasCache.backfill(tz1s, deriveEvmAlias);
}

const EIP_UNAUTHORIZED       = 4100;
const EIP_USER_REJECTED      = 4001;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS   = -32602;
const JSON_RPC_INTERNAL         = -32603;
const JSON_RPC_LIMIT_EXCEEDED   = -32005;

export async function dispatch(
  msg:    PopupRequest | ApproveRequest | EthereumRequest | BeaconRequest,
  source: ClassifiedSource,
  deps:   SwDeps,
): Promise<WalletResponse> {
  if ('type' in msg && (msg.type === 'ETHEREUM_REQUEST' || msg.type === 'BEACON_REQUEST')) {
    // dApp traffic must arrive over the untrusted dApp channel, and when the
    // host attests an origin it must match the origin stamped into the
    // envelope. Reject trusted-ui / unrecognized sources so they can't
    // impersonate a dApp, and reject a stamped origin that disagrees with the
    // host-verified one. Both dApp surfaces (EIP-1193 and Beacon) clear the
    // same gate — a second surface must not come with a second, weaker guard.
    if (
      source == null ||
      source.channel !== 'dapp' ||
      (source.verifiedOrigin != null && source.verifiedOrigin !== msg.origin)
    ) {
      return { ok: false, code: EIP_UNAUTHORIZED, message: 'Forbidden sender' };
    }
    return msg.type === 'ETHEREUM_REQUEST'
      ? handleEthereumRequest(msg, deps)
      : handleBeaconRequest(msg, deps);
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
  const stateDeps = { keyring: deps.keyring, aliasCache: deps.aliasCache };
  // Callers must `return await refreshState()` (not bare `return`): inside the
  // try block, only an awaited rejection reaches the catch-all envelope — a
  // returned promise would escape dispatch entirely, unenveloped.
  const refreshState = async (): Promise<WalletResponse> => {
    const data = await getState(stateDeps);
    kickAliasBackfill(deps);
    return { ok: true, data };
  };

  try {
    switch (msg.type) {
      case 'GET_STATE':
        return await refreshState();

      case 'CREATE_WALLET': {
        await createAccount({ mnemonic: msg.mnemonic, password: msg.password }, { keyring: deps.keyring });
        await deps.rebuildContainer();
        return await refreshState();
      }

      case 'IMPORT_WALLET': {
        await importAccount(
          { source: 'mnemonic', mnemonic: msg.mnemonic, password: msg.password },
          { keyring: deps.keyring },
        );
        await deps.rebuildContainer();
        return await refreshState();
      }

      case 'IMPORT_SECRET_KEY': {
        await importAccount(
          { source: 'edsk', edsk: msg.edsk, password: msg.password },
          { keyring: deps.keyring },
        );
        await deps.rebuildContainer();
        return await refreshState();
      }

      case 'IMPORT_EVM_PRIVKEY': {
        await importAccount(
          { source: 'evm-privkey', privateKey: msg.privateKey, password: msg.password },
          { keyring: deps.keyring },
        );
        await deps.rebuildContainer();
        return await refreshState();
      }

      case 'UNLOCK': {
        await unlockVault({ password: msg.password }, { keyring: deps.keyring, tokenStore: deps.persistentPorts.tokenStore });
        await deps.rebuildContainer();
        return await refreshState();
      }

      case 'LOCK': {
        lockVault({ keyring: deps.keyring, approvalQueue: deps.approvalQueue });
        deps.state.container = null;
        // deps.aliasCache deliberately survives lock: aliases are immutable
        // public mappings, and keeping them lets a relock → unlock cycle
        // complete fully offline.
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
        const unlocked = deps.keyring.getUnlocked();
        if (deps.state.container == null || unlocked == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        const account = unlocked.account;
        const result = await listActivity(
          { cursor: msg.cursor, limit: msg.limit, filter: msg.filter },
          {
            container:     deps.state.container,
            evmAlias:      account.kind === 'tezos' ? deps.aliasCache.get(account.tz1) : account.address,
            snapshotStore: deps.persistentPorts.snapshotStore,
            accountId:     account.id,
          },
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
        const removed   = deps.keyring.listAccounts().find((a) => a.id === msg.accountId);
        await removeAccount({ accountId: msg.accountId, password: msg.password }, { keyring: deps.keyring });
        deps.containerCache.evict(msg.accountId);
        // Hygiene: the alias map enumerates tz1s and the snapshots hold that
        // account's read models — both outlive their account otherwise.
        if (removed?.kind === 'tezos') deps.aliasCache.remove(removed.tz1);
        void deps.persistentPorts.snapshotStore.clearAccount(msg.accountId).catch(() => { /* best-effort */ });
        // A dApp connected with the removed account loses its account: drop
        // that per-origin session and tell only that origin (accountsChanged
        // []). Origins bound to other accounts are untouched — an account
        // operation must not disclose or re-point another origin's account.
        await disconnectRemovedAccountSessions(msg.accountId, deps);
        if (wasActive) {
          await deps.rebuildContainer();
          return await refreshState();
        }
        return await refreshState();
      }

      case 'SET_ACTIVE_ACCOUNT': {
        const unlocked = deps.keyring.getUnlocked();
        if (unlocked == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        if (unlocked.account.id === msg.accountId) return await refreshState();
        await setActiveAccount({ accountId: msg.accountId }, { keyring: deps.keyring });
        await deps.rebuildContainer();
        // No accountsChanged broadcast: switching the active account (for the
        // user's own Send/Receive) does not change what any connected dApp
        // sees — each origin stays bound to the account it connected with.
        // Broadcasting the new active alias to every origin was the SEC-1 leak.
        return await refreshState();
      }

      case 'RENAME_ACCOUNT': {
        if (deps.keyring.getUnlocked() == null) {
          return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        }
        await renameAccount({ accountId: msg.accountId, label: msg.label }, { keyring: deps.keyring });
        return await refreshState();
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

      // Contacts are wallet-global (no accountId), but still gated on an
      // unlocked vault: the address book is user-private metadata and only
      // the unlocked UI has any business reading or editing it.
      case 'ADD_CONTACT': {
        if (deps.keyring.getUnlocked() == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const contact = await addContact(
          { address: msg.address, label: msg.label },
          { contactStore: deps.persistentPorts.contactStore },
        );
        return { ok: true, data: contact };
      }

      case 'RENAME_CONTACT': {
        if (deps.keyring.getUnlocked() == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const contact = await renameContact(
          { address: msg.address, label: msg.label },
          { contactStore: deps.persistentPorts.contactStore },
        );
        return { ok: true, data: contact };
      }

      case 'REMOVE_CONTACT': {
        if (deps.keyring.getUnlocked() == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        await removeContact({ address: msg.address }, { contactStore: deps.persistentPorts.contactStore });
        return { ok: true };
      }

      case 'LIST_CONTACTS': {
        if (deps.keyring.getUnlocked() == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        const contacts = await listContacts({ contactStore: deps.persistentPorts.contactStore });
        return { ok: true, data: contacts };
      }

      case 'CHANGE_PASSWORD': {
        if (deps.keyring.getUnlocked() == null) return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
        await changePassword(
          { currentPassword: msg.currentPassword, newPassword: msg.newPassword },
          { keyring: deps.keyring },
        );
        return { ok: true };
      }

      // Deliberately NOT gated on an unlocked keyring: this is the
      // forgot-password path, reachable only from the trusted UI (the sender
      // guard upstream rejects dApp channels for every popup request). It
      // destroys ciphertext the user cannot open anyway; the UI in front of
      // it carries the explicit what-is-lost disclosure.
      case 'RESET_WALLET': {
        await resetWallet({
          keyring:      deps.keyring,
          sessionStore: deps.persistentPorts.sessionStore,
          tokenStore:   deps.persistentPorts.tokenStore,
        });
        deps.approvalQueue.rejectAll('wallet reset');
        deps.state.container = null;
        // Reset is the one place the alias cache (and its persisted map) goes
        // too: it enumerates the vault's tz1s, and the vault they belong to
        // no longer exists. Snapshots die with their accounts for the same
        // reason.
        deps.aliasCache.clear();
        await deps.persistentPorts.snapshotStore.clear().catch(() => { /* best-effort */ });
        deps.containerCache.clear();
        return { ok: true };
      }

      default:
        return { ok: false, code: JSON_RPC_METHOD_NOT_FOUND, message: `Unknown popup request type` };
    }
  } catch (err) {
    // Preserve a numeric code carried by the error (e.g. 4900 from the
    // relayer's rpc helper on a network failure) — flattening everything to
    // -32603 was defeating code-based error handling in the UI.
    const thrown = err as { code?: unknown; message?: string };
    const code   = typeof thrown.code === 'number' ? thrown.code : JSON_RPC_INTERNAL;
    return { ok: false, code, message: (err as Error).message };
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
    // A Beacon session must NOT satisfy this. It discloses a tz1 and its public
    // key; nothing about granting that is consent to hand the same origin an EVM
    // address. The `evmAlias` guard is belt-and-braces: a Beacon session stores an
    // empty one, so even a mistake in the protocol filter discloses nothing.
    const session = sessions.find((s) => s.origin === msg.origin && s.protocol !== 'beacon');
    return { ok: true, data: session == null || session.evmAlias === '' ? [] : [session.evmAlias] };
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
      // A Beacon grant is NOT an EIP-1193 grant. Without this filter, connecting
      // over Beacon would silently authorise eth_sendTransaction and
      // personal_sign for the same origin.
      const session  = sessions.find((s) => s.origin === msg.origin && s.protocol !== 'beacon');
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

    const outcome = await requestApproval(pending, deps);
    if (outcome.kind === 'refused') return outcome.response;
    if (outcome.decision === 'reject') {
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

type ApprovalOutcome =
  | { kind: 'decision'; decision: 'approve' | 'reject' }
  | { kind: 'refused';  response: WalletResponse };

/**
 * Enqueue a dApp approval and turn the queue's two structural refusals into
 * envelopes. Shared by every dApp surface on purpose: the per-origin flood cap
 * is the wallet's only defence against approval fatigue, and a second surface
 * that hand-rolled its own enqueue could silently skip it.
 */
async function requestApproval(
  pending: Parameters<ApprovalQueue['enqueue']>[0],
  deps:    SwDeps,
): Promise<ApprovalOutcome> {
  try {
    return { kind: 'decision', decision: await deps.approvalQueue.enqueue(pending) };
  } catch (err) {
    if (err instanceof DuplicateRequestIdError) {
      return {
        kind: 'refused',
        response: { ok: false, code: JSON_RPC_INVALID_PARAMS, message: 'Duplicate request id' },
      };
    }
    if (err instanceof TooManyPendingRequestsError) {
      // -32005: limit exceeded (EIP-1474). Rejects the flood without opening
      // yet another popup.
      return {
        kind: 'refused',
        response: {
          ok: false, code: JSON_RPC_LIMIT_EXCEEDED,
          message: 'Too many pending requests from this origin',
        },
      };
    }
    throw err;
  }
}

// ── Beacon dispatch (content script ↔ SW) ─────────────────────────────────────

/**
 * Route a Beacon request to its handler.
 *
 * Only ONE guard is shared: an unlocked vault. The active account's KIND is
 * deliberately NOT checked here.
 *
 * It used to be, and that was a bug. `handleBeaconOperation` never reads the
 * active account — it signs with `session.accountId`, the account the grant was
 * given for, and already fails closed on that account's own kind. So a shared
 * check only produced a FALSE refusal: adding an EVM account activates it
 * (`AddAccount` sends SET_ACTIVE_ACCOUNT unconditionally), which would then
 * refuse every operation for every live Beacon session — and the refusal's advice
 * to "connect again" would re-point the session to a different account, the exact
 * thing binding a session to its account exists to prevent.
 */
async function handleBeaconRequest(msg: BeaconRequest, deps: SwDeps): Promise<WalletResponse> {
  const unlocked = deps.keyring.getUnlocked();
  if (unlocked == null) {
    return { ok: false, code: EIP_UNAUTHORIZED, message: 'Wallet is locked' };
  }

  return msg.request.kind === 'permission'
    ? handleBeaconPermission(msg, msg.request, unlocked.account, deps)
    : handleBeaconOperation(msg, msg.request, deps);
}

/**
 * Answer a Beacon `permission_request`.
 *
 * Mirrors `eth_requestAccounts`: user approval through the same queue and the
 * same Approve surface, account pinned at enqueue time. Two things differ, both
 * deliberate:
 *
 *  - The requested network is CHECKED, and the response states the wallet's own
 *    network rather than echoing the request. Echoing would make the dApp's
 *    network gate a check against its own question — vacuous by construction.
 *  - The `StoredSession` written on approval carries `protocol: 'beacon'`, and
 *    `eth_accounts` skips those. So a Beacon grant is a first-class session — it
 *    appears in Connected sites, `DISCONNECT` revokes it, and it gates
 *    `operation_request` — WITHOUT ever satisfying an EIP-1193 request the user
 *    never approved.
 */
async function handleBeaconPermission(
  msg:     BeaconRequest,
  request: BeaconPermissionRequest,
  active:  Account,
  deps:    SwDeps,
): Promise<WalletResponse> {
  // Connecting is the ONE Beacon request that legitimately depends on the active
  // account: it is the account being offered. A Beacon dApp asks for a Tezos
  // address and its public key, which an EVM-source account does not have.
  if (active.kind !== 'tezos') {
    return {
      ok:      false,
      code:    BEACON_NO_ADDRESS,
      message:
        'The active account is an EVM (0x) account. A Beacon dApp needs a Tezos ' +
        'account — switch to a tz1 account in the wallet and connect again.',
    };
  }
  const account = active;

  const verdict = checkRequestedNetwork(request.network);
  if (!verdict.ok) {
    return { ok: false, code: BEACON_NETWORK_NOT_SUPPORTED, message: verdict.reason };
  }

  const outcome = await requestApproval({
    kind:      'connect',
    protocol:  'beacon',
    requestId: msg.requestId,
    origin:    msg.origin,
    accountId: account.id,
    createdAt: Date.now(),
  }, deps);
  if (outcome.kind === 'refused') return outcome.response;
  if (outcome.decision === 'reject') {
    return { ok: false, code: EIP_USER_REJECTED, message: 'User rejected the request' };
  }

  // Re-read the pinned account: REMOVE_ACCOUNT, a lock, or an account switch can
  // land between enqueue and approval, and the grant must describe the account
  // the user actually confirmed — never whichever one happens to be active now.
  const pinned = deps.keyring.listAccounts().find((a) => a.id === account.id);
  if (pinned == null || pinned.kind !== 'tezos') {
    return {
      ok:      false,
      code:    EIP_USER_REJECTED,
      message: 'The connecting account was removed before approval',
    };
  }

  // `evmAlias` and `chainId` are deliberately empty: a Beacon session grants no
  // EIP-1193 access, and leaving them blank means a mistake in the `eth_accounts`
  // filter surfaces as an empty array rather than as a disclosed address.
  const session: StoredSession = {
    origin:      msg.origin,
    accountId:   pinned.id,
    protocol:    'beacon',
    tz1Address:  pinned.tz1,
    evmAlias:    '',
    chainId:     '',
    connectedAt: Date.now(),
  };
  await deps.persistentPorts.sessionStore.upsert(session);

  const grant: BeaconPermissionGrant = {
    address:   pinned.tz1,
    publicKey: pinned.publicKey,
    network:   WALLET_BEACON_NETWORK,
    scopes:    grantScopes(request.scopes),
  };
  return { ok: true, data: grant };
}

/**
 * Sign and inject ONE Michelson operation for a connected Beacon dApp.
 *
 * Mirrors `eth_sendTransaction`: a session is required, the operation is shown
 * before it is signed, and the signing account is the one the session was granted
 * with — NOT whichever account happens to be active now. That last point is the
 * reason `pinnedAccountId` exists on the EIP-1193 path: a user who switches
 * accounts mid-session must not have a dApp's operation silently re-pointed at
 * the new one.
 *
 * The operation is validated BEFORE the prompt. Every field is page-supplied
 * JSON that the Beacon SDK does not check, and an operator should never be asked
 * to confirm something that cannot be submitted.
 */
async function handleBeaconOperation(
  msg:     BeaconRequest,
  request: BeaconOperationRequest,
  deps:    SwDeps,
): Promise<WalletResponse> {
  const sessions = await deps.persistentPorts.sessionStore.list();
  const session  = sessions.find((s) => s.origin === msg.origin && s.protocol === 'beacon');
  if (session == null) {
    return {
      ok:      false,
      code:    BEACON_NOT_CONNECTED,
      message: 'Origin is not connected. Request permissions first.',
    };
  }

  const op      = request.operation;
  const verdict = checkOperation(op);
  if (!verdict.ok) {
    return { ok: false, code: JSON_RPC_INVALID_PARAMS, message: verdict.reason };
  }

  const accountId = session.accountId;
  if (accountId == null || accountId === '') {
    return {
      ok:      false,
      code:    BEACON_NOT_CONNECTED,
      message: 'This connection predates per-account sessions. Reconnect to continue.',
    };
  }

  const outcome = await requestApproval({
    kind:              'tezos-operation',
    requestId:         msg.requestId,
    origin:            msg.origin,
    accountId,
    createdAt:         Date.now(),
    destination:       op.destination,
    amount:            op.amount,
    entrypoint:        op.parameter?.entrypoint,
    parametersPreview: op.parameter == null ? undefined : summariseMicheline(op.parameter.value),
    limits:            op.limits,
    maxCostMutez:      op.limits == null ? undefined : String(maxOpCostMutez(op.limits, op.amount)),
  }, deps);
  if (outcome.kind === 'refused') return outcome.response;
  if (outcome.decision === 'reject') {
    return { ok: false, code: EIP_USER_REJECTED, message: 'User rejected the request' };
  }

  let container: Container;
  try {
    container = await ensureContainerFor(accountId, {
      keyring:         deps.keyring,
      containerCache:  deps.containerCache,
      persistentPorts: deps.persistentPorts,
      onProviderEvent: deps.broadcastEvent,
    });
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      return {
        ok:      false,
        code:    EIP_USER_REJECTED,
        message: 'The signing account was removed before approval',
      };
    }
    throw err;
  }

  const signer = container.signer;
  if (signer.kind !== 'tezos') {
    return {
      ok:      false,
      code:    BEACON_NO_ADDRESS,
      message: 'The account this session was granted with cannot sign Michelson operations',
    };
  }

  try {
    const opHash = await signer.sendOperation({
      to:          op.destination,
      mutezAmount: op.amount,
      parameter:   op.parameter,
      limits:      op.limits,
    });
    return { ok: true, data: { opHash } };
  } catch (err) {
    // The operation was approved and then failed — a simulation refusal, a fee
    // below the floor, an injection error. Surfaced as its own code so the dApp
    // is not told the user aborted something they in fact confirmed.
    const e = err as { message?: string };
    return {
      ok:      false,
      code:    BEACON_OPERATION_FAILED,
      message: e.message ?? 'The operation could not be injected',
    };
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

