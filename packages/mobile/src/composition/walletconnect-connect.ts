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
  EIP155_CHAIN,
  type SessionProposal,
  type SessionRequest,
} from '../transport/walletconnect';
import { deps, cryptoPort } from './wiring';

/**
 * What the wallet offers over a connected session, connect-first:
 * - `eth_accounts` only — the one read method the core answers from the session
 *   store without a warm Container (signing is a later effort, with biometrics
 *   per signature, so eth_sendTransaction / personal_sign are deliberately
 *   omitted; the chain itself is conveyed by `chains`, so eth_chainId-over-WC
 *   isn't needed and would require a Container mobile doesn't keep warm).
 */
const SUPPORTED_METHODS = ['eth_accounts'];
const SUPPORTED_EVENTS  = ['accountsChanged', 'chainChanged'];

/** Boot WalletConnect and route its events through the core dispatch. Idempotent
 *  (safe to call on every App mount). */
export async function startWalletConnect(): Promise<void> {
  await initWalletKit({ onProposal: handleProposal, onRequest: handleRequest });
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
  try {
    const namespaces = buildApprovedNamespaces({
      proposal: proposal.params,
      supportedNamespaces: {
        eip155: {
          chains:   [EIP155_CHAIN],
          methods:  SUPPORTED_METHODS,
          events:   SUPPORTED_EVENTS,
          accounts: [`${EIP155_CHAIN}:${alias}`],
        },
      },
    });
    await approveProposal({ id: proposal.id, namespaces });
    devLog.info('[wc] session approved for', origin, alias);
  } catch (err) {
    // buildApprovedNamespaces throws when the dApp requires a chain/method the
    // wallet doesn't support (e.g. a mainnet-only dApp vs eip155:128064).
    devLog.warn('[wc] cannot satisfy proposal namespaces:', (err as Error).message);
    await rejectProposal(proposal.id);
  }
}

async function handleRequest(request: SessionRequest): Promise<void> {
  const { topic, id } = request;
  const origin = sessionOrigin(topic) ?? '';
  const msg: EthereumRequest = {
    type:      'ETHEREUM_REQUEST',
    origin,
    requestId: cryptoPort.randomUUID(),
    args:      { method: request.params.request.method, params: request.params.request.params },
  };
  const source: ClassifiedSource = { channel: 'dapp', verifiedOrigin: origin };

  const res = await dispatch(msg, source, deps);
  if (res.ok) {
    await respondToRequest({ topic, id, result: res.data });
  } else {
    await respondToRequest({ topic, id, error: { code: res.code, message: res.message } });
  }
}
