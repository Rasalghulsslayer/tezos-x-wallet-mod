/**
 * WalletConnect transport — the low-level Reown WalletKit facade. It owns the
 * single `walletKit` instance and exposes pairing, session approval/rejection,
 * request responses, and provider-event emission. It is the mobile equivalent
 * of the extension's content bridge: the surface through which an external dApp
 * reaches the wallet.
 *
 * It is deliberately free of any wallet/account logic — the connect
 * orchestration (composition/walletconnect-connect.ts) injects `onProposal` /
 * `onRequest` handlers that drive the shared core `dispatch`, builds the
 * approved namespaces, and decides what to approve. This module only speaks WC.
 *
 * `@walletconnect/react-native-compat` is imported once, first, in `index.ts`;
 * by the time this module loads, the globals WalletKit needs are in place.
 */

import { WalletKit, type IWalletKit } from '@reown/walletkit';
import { Core } from '@walletconnect/core';
import type { SignClientTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { PREVIEWNET_CHAIN_ID } from '@tezosx/wallet-core/shared/constants';
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';
import { devLog } from '@tezosx/wallet-core/shared/log';

export type SessionProposal = SignClientTypes.EventArguments['session_proposal'];
export type SessionRequest = SignClientTypes.EventArguments['session_request'];

/** CAIP-2 id of the Tezos X EVM runtime (previewnet) — the one chain we expose. */
export const EIP155_CHAIN = `eip155:${PREVIEWNET_CHAIN_ID}`;

/** How the wallet presents itself to dApps in their connect modal. The icon URL
 *  is fetched by the dApp, so it must be a public, stable address. */
const METADATA = {
  name: 'Tezos X Wallet',
  description: 'A wallet for Tezos X — one ledger, two runtimes.',
  url: 'https://tezos.com',
  icons: ['https://avatars.githubusercontent.com/u/39299616'],
};

export interface WalletKitHandlers {
  onProposal: (proposal: SessionProposal) => void;
  onRequest:  (request: SessionRequest) => void;
}

let walletKit: IWalletKit | null = null;
let initPromise: Promise<IWalletKit> | null = null;

/**
 * Idempotently boot WalletKit. The first caller wins and registers the single
 * proposal/request listeners; concurrent and later callers share the instance.
 * Throws if the Reown project id is missing.
 */
export function initWalletKit(handlers: WalletKitHandlers): Promise<IWalletKit> {
  if (walletKit) return Promise.resolve(walletKit);
  if (!initPromise) {
    initPromise = (async (): Promise<IWalletKit> => {
      const projectId = process.env.EXPO_PUBLIC_WC_PROJECT_ID;
      if (projectId == null || projectId === '') {
        throw new Error(
          'EXPO_PUBLIC_WC_PROJECT_ID is not set — add it to packages/mobile/.env.local',
        );
      }
      const core = new Core({ projectId });
      const kit = await WalletKit.init({ core, metadata: METADATA });
      kit.on('session_proposal', (proposal) => {
        devLog.info('[wc] session_proposal from', proposalPeerName(proposal), proposalPeerUrl(proposal));
        handlers.onProposal(proposal);
      });
      kit.on('session_request', (request) => {
        devLog.info('[wc] session_request', request.params.request.method);
        handlers.onRequest(request);
      });
      kit.on('session_delete', (ev) => devLog.info('[wc] session_delete', ev.topic));
      devLog.info('[wc] WalletKit initialised');
      walletKit = kit;
      return kit;
    })();
  }
  return initPromise;
}

/**
 * Pair with a dApp from its `wc:` URI. WalletKit must already be initialised;
 * the incoming proposal arrives asynchronously on the `onProposal` handler.
 */
export async function pairWithUri(uri: string): Promise<void> {
  if (walletKit == null) throw new Error('WalletKit is not initialised yet');
  const trimmed = uri.trim();
  devLog.info('[wc] pairing', trimmed.slice(0, 24));
  await walletKit.pair({ uri: trimmed });
  const pending = Object.values(walletKit.getPendingSessionProposals());
  devLog.info('[wc] paired; pending proposals:', pending.length);
}

/** Approve a session proposal with the reconciled namespaces. */
export async function approveProposal(
  params: Parameters<IWalletKit['approveSession']>[0],
): Promise<void> {
  if (walletKit == null) throw new Error('WalletKit is not initialised yet');
  await walletKit.approveSession(params);
}

/** Reject a session proposal (user declined or the wallet could not satisfy it). */
export async function rejectProposal(id: number): Promise<void> {
  if (walletKit == null) throw new Error('WalletKit is not initialised yet');
  await walletKit.rejectSession({ id, reason: getSdkError('USER_REJECTED') });
}

/** Respond to a session request with a JSON-RPC result or error. */
export async function respondToRequest(opts: {
  topic:  string;
  id:     number;
  result?: unknown;
  error?:  { code: number; message: string };
}): Promise<void> {
  if (walletKit == null) throw new Error('WalletKit is not initialised yet');
  const response = opts.error != null
    ? { id: opts.id, jsonrpc: '2.0' as const, error: opts.error }
    : { id: opts.id, jsonrpc: '2.0' as const, result: opts.result };
  await walletKit.respondSessionRequest({ topic: opts.topic, response });
}

/** The dApp origin (verified url) for an active session, by topic. */
export function sessionOrigin(topic: string): string | undefined {
  return walletKit?.getActiveSessions()[topic]?.peer.metadata.url;
}

/**
 * Push a wallet provider event to every connected dApp. Only accountsChanged /
 * chainChanged map to WalletConnect session events; the other ContentPush kinds
 * (connect/disconnect/WALLET_ROLE/responses) are extension-only and ignored.
 */
export async function emitProviderEvent(push: ContentPush): Promise<void> {
  if (walletKit == null) return;
  if (push.type !== 'PROVIDER_EVENT') return;
  if (push.event !== 'accountsChanged' && push.event !== 'chainChanged') return;

  const event = push.event === 'accountsChanged'
    ? { name: 'accountsChanged', data: push.data.map((a) => `${EIP155_CHAIN}:${a}`) }
    : { name: 'chainChanged', data: PREVIEWNET_CHAIN_ID };

  await Promise.all(
    Object.values(walletKit.getActiveSessions()).map((session) =>
      walletKit!.emitSessionEvent({ topic: session.topic, event, chainId: EIP155_CHAIN }).catch(() => {}),
    ),
  );
}

/** The dApp's display name from a proposal, falling back to its URL. */
export function proposalPeerName(proposal: SessionProposal): string {
  const meta = proposal.params.proposer.metadata;
  return meta.name || meta.url || 'Unknown dApp';
}

/** The dApp's origin URL from a proposal (used as the verified origin). */
export function proposalPeerUrl(proposal: SessionProposal): string {
  return proposal.params.proposer.metadata.url;
}
