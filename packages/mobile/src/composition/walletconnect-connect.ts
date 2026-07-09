/**
 * WalletConnect connect orchestration — wires the WC transport to the shared
 * core `dispatch`, so a dApp connecting over WalletConnect goes through exactly
 * the same routing, approval, and session-store path as the extension's
 * service worker.
 *
 * A `session_proposal` becomes an `eth_requestAccounts` request: we mint a
 * requestId (never trust the dApp for it), classify the source as the dApp
 * channel with the peer's url as the verified origin, and call `dispatch`. That
 * suspends on the approval modal; on approval the core resolves the account's
 * EVM alias and writes the per-origin session, then we approve the WC session
 * declaring eip155:<previewnet> + that alias. A `session_request` (e.g.
 * eth_accounts) runs through the same dispatch and is answered over WC.
 *
 * Signing methods are intentionally NOT offered yet (connect-first scope), so
 * only read methods appear in the approved namespaces.
 */

import { buildApprovedNamespaces } from '@walletconnect/utils';
import type { SessionTypes } from '@walletconnect/types';
import { dispatch } from '@tezosx/wallet-core/composition/sw-wiring';
import type { EthereumRequest } from '@tezosx/wallet-core/shared/messages';
import type { ClassifiedSource } from '@tezosx/wallet-core/ports/message-source';
import { devLog } from '@tezosx/wallet-core/shared/log';
import {
  initWalletKit,
  pairWithUri,
  approveProposal,
  rejectProposal,
  respondToRequest,
  sessionOrigin,
  proposalPeerUrl,
  listSessions,
  subscribeSessions,
  EIP155_CHAIN,
  type SessionProposal,
  type SessionRequest,
} from '../transport/walletconnect';
import { deps, cryptoPort, sessionStore } from './wiring';

/**
 * What the wallet offers over a connected session:
 * - `eth_accounts` — the read method the core answers from the session store.
 * - `eth_sendTransaction` — a Tezos (tz1) account routes this through the NAC
 *   gateway (cross-runtime L1 → L2); dispatch builds the Michelson call ahead of
 *   approval and the Approve modal shows both the dApp intent and what actually
 *   gets signed, gated by a biometric confirmation.
 *
 * `personal_sign` is intentionally omitted: a tz1 account can't produce an EVM
 * personal_sign (the RelayerProvider rejects it 4200), so offering it would be
 * dishonest. The chain is conveyed by `chains`, so eth_chainId-over-WC isn't
 * offered (it would need a Container the mobile side doesn't keep warm).
 */
const SUPPORTED_METHODS = ['eth_accounts', 'eth_sendTransaction'];
const SUPPORTED_EVENTS  = ['accountsChanged', 'chainChanged'];

/** Boot WalletConnect and route its events through the core dispatch. Idempotent
 *  (safe to call on every App mount). WalletKit restores previously-approved
 *  sessions from its own storage on init, so this also re-attaches the relay for
 *  dApps connected before the app was closed. */
export async function startWalletConnect(): Promise<void> {
  await initWalletKit({ onProposal: handleProposal, onRequest: handleRequest });
  // Keep the stored-session set (which gates eth_accounts) in step with the WC
  // sessions — on wallet-side disconnect, dApp-side disconnect, and at startup
  // (in case a session was revoked while the app was closed).
  subscribeSessions(() => { void reconcileStoredSessions(); });
  await reconcileStoredSessions();
}

/** Drop any StoredSession whose origin no longer has a live WC session. */
async function reconcileStoredSessions(): Promise<void> {
  const activeUrls = new Set(listSessions().map((s) => s.url));
  const stored = await sessionStore.list();
  await Promise.all(
    stored.filter((s) => !activeUrls.has(s.origin)).map((s) => sessionStore.remove(s.origin)),
  );
}

/**
 * Re-point every stored dApp session at the given account. Connected dApps
 * follow the active account (`eth_accounts` answers from the stored session,
 * and signing uses the active account), so an account switch must rebind the
 * per-origin sessions or the two would answer different accounts. Mirrors the
 * fields the connect flow writes; origin / chainId / connectedAt are kept.
 */
export async function rebindStoredSessions(account: {
  accountId:  string;
  tz1Address: string;
  evmAlias:   string;
}): Promise<void> {
  const stored = await sessionStore.list();
  await Promise.all(
    stored.map((s) => sessionStore.upsert({
      ...s,
      accountId:  account.accountId,
      tz1Address: account.tz1Address,
      evmAlias:   account.evmAlias,
    })),
  );
}

/** Pair with a dApp from a pasted `wc:` URI. */
export async function connect(uri: string): Promise<void> {
  await pairWithUri(uri);
}

async function handleProposal(proposal: SessionProposal): Promise<void> {
  const origin = proposalPeerUrl(proposal);
  const msg: EthereumRequest = {
    type:      'ETHEREUM_REQUEST',
    origin,
    requestId: cryptoPort.randomUUID(),
    args:      { method: 'eth_requestAccounts' },
  };
  const source: ClassifiedSource = { channel: 'dapp', verifiedOrigin: origin };

  // Suspends until the user resolves the approval modal; on approve, the core
  // derives the EVM alias, runs provider.request, and writes the session.
  const res = await dispatch(msg, source, deps);

  if (!res.ok || !Array.isArray(res.data) || typeof res.data[0] !== 'string') {
    await rejectProposal(proposal.id);
    return;
  }

  const alias = res.data[0];
  devLog.info(
    '[wc] proposal namespaces — required:', JSON.stringify(proposal.params.requiredNamespaces),
    'optional:', JSON.stringify(proposal.params.optionalNamespaces),
  );

  // The wallet lives on exactly one EVM chain (Tezos X previewnet). Offer it
  // with the connecting account.
  const ownNamespaces = {
    eip155: {
      chains:   [EIP155_CHAIN],
      methods:  SUPPORTED_METHODS,
      events:   SUPPORTED_EVENTS,
      accounts: [`${EIP155_CHAIN}:${alias}`],
    },
  };

  // Prefer the reconciled namespaces when the dApp actually asked for our chain;
  // otherwise declare our chain directly (a mainnet-only dApp will then decline
  // on its side, which is correct — we genuinely can't serve other chains).
  let namespaces: SessionTypes.Namespaces = ownNamespaces;
  try {
    const built = buildApprovedNamespaces({ proposal: proposal.params, supportedNamespaces: ownNamespaces });
    if (built.eip155 != null && built.eip155.accounts.length > 0) namespaces = built;
  } catch (err) {
    devLog.info('[wc] dApp did not request eip155:128064; offering it directly:', (err as Error).message);
  }

  try {
    await approveProposal({ id: proposal.id, namespaces });
    devLog.info('[wc] session approved for', origin, alias);
  } catch (err) {
    devLog.warn('[wc] approveSession rejected:', (err as Error).message);
    await rejectProposal(proposal.id);
  }
}

async function handleRequest(request: SessionRequest): Promise<void> {
  const { topic, id } = request;
  const method = request.params.request.method;
  const origin = sessionOrigin(topic) ?? '';

  // EVM message signatures a Tezos (tz1) account cannot produce — its 0x is a
  // kernel-derived alias with no wallet-held secp256k1 key. Reject promptly so
  // the dApp gets an answer instead of waiting on a signature that never comes
  // (and so the user isn't asked to approve something that would fail anyway).
  // When EVM-native accounts land these become signable and can be advertised.
  if (method === 'personal_sign' || method === 'eth_sign' || method.startsWith('eth_signTypedData')) {
    await respondToRequest({ topic, id, error: { code: 4200, message: `${method} is not supported by Tezos accounts` } });
    return;
  }

  const msg: EthereumRequest = {
    type:      'ETHEREUM_REQUEST',
    origin,
    requestId: cryptoPort.randomUUID(),
    args:      { method, params: request.params.request.params },
  };
  const source: ClassifiedSource = { channel: 'dapp', verifiedOrigin: origin };

  const res = await dispatch(msg, source, deps);
  if (res.ok) {
    await respondToRequest({ topic, id, result: res.data });
  } else {
    await respondToRequest({ topic, id, error: { code: res.code, message: res.message } });
  }
}
