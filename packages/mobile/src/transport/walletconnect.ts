/**
 * WalletConnect transport — boots Reown WalletKit and pairs with a dApp from a
 * pasted `wc:` URI. This is the mobile equivalent of the extension's content
 * bridge: the surface through which an external dApp reaches the wallet.
 *
 * For now it proves the connection path end-to-end — init on Hermes, pair, and
 * surface the incoming session proposal — without approving anything. The
 * `onProposal` seam is deliberately injectable: today the screen passes a
 * handler that displays the proposal; next it will pass one that mints a
 * requestId, classifies the source, and drives the shared `dispatch`.
 *
 * `@walletconnect/react-native-compat` is imported once, first, in `index.ts`;
 * by the time this module loads, the globals WalletKit needs are in place.
 */

import { WalletKit, type IWalletKit } from '@reown/walletkit';
import { Core } from '@walletconnect/core';
import type { SignClientTypes } from '@walletconnect/types';
import { devLog } from '@tezosx/wallet-core/shared/log';

export type SessionProposal = SignClientTypes.EventArguments['session_proposal'];

/**
 * How the wallet presents itself to dApps in their connect modal. The icon URL
 * is fetched by the dApp, so it must be a public, stable address.
 */
const METADATA = {
  name: 'Tezos X Wallet',
  description: 'A wallet for Tezos X — one ledger, two runtimes.',
  url: 'https://tezos.com',
  icons: ['https://avatars.githubusercontent.com/u/39299616'],
};

let walletKit: IWalletKit | null = null;
let initPromise: Promise<IWalletKit> | null = null;

/**
 * Idempotently boot WalletKit. The first caller wins and registers the single
 * `session_proposal` listener; concurrent and later callers share the same
 * instance. Throws if the Reown project id is missing.
 */
export function initWalletKit(handlers: {
  onProposal: (proposal: SessionProposal) => void;
}): Promise<IWalletKit> {
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
      // Lifecycle visibility while we bring the connection path up.
      kit.on('session_request', (req) => devLog.info('[wc] session_request', req.params.request.method));
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
  // Diagnostic: if pairing succeeds but no proposal arrives on the listener, a
  // non-zero pending count means the proposal was delivered but not via the
  // event (e.g. a re-pair of an already-consumed URI); zero means the dApp never
  // sent one (closed modal / expired URI).
  const pending = Object.values(walletKit.getPendingSessionProposals());
  devLog.info('[wc] paired; pending proposals:', pending.length);
}

/** The dApp's display name from a proposal, falling back to its URL. */
export function proposalPeerName(proposal: SessionProposal): string {
  const meta = proposal.params.proposer.metadata;
  return meta.name || meta.url || 'Unknown dApp';
}

/** The dApp's origin URL from a proposal (used as the verified origin later). */
export function proposalPeerUrl(proposal: SessionProposal): string {
  return proposal.params.proposer.metadata.url;
}
