/**
 * `WalletClient` wired to the extension's own post_message transport.
 *
 * ── WHY A SUBCLASS ───────────────────────────────────────────────────────────
 *
 * `WalletClient.init()` takes no arguments and hardcodes a Matrix P2P transport
 * (`@airgap/beacon-wallet/dist/esm/client/WalletClient.js:39-43`), while the
 * transport-accepting `init` one level up in `Client` is the one it calls
 * through to. `setTransport` is `protected`, and `WalletPostMessageTransport` is
 * not even in the package's public exports. There is no supported way to hand
 * `WalletClient` a transport, so this reaches `Client.prototype.init` directly.
 *
 * That matters beyond tidiness: booting the shipped `init()` would open a Matrix
 * connection to a public relay from every page the content script runs on.
 *
 * ── STORAGE ──────────────────────────────────────────────────────────────────
 *
 * `chrome.storage.local` rather than the SDK's default `LocalStorage`. In a
 * content script `localStorage` is the PAGE's — so the default would put the
 * wallet's Beacon secret seed somewhere the page can read it, and give every
 * origin a different wallet identity. `chrome.storage.local` is
 * extension-private and shared across tabs, so one pairing holds everywhere.
 *
 * Via `ChromeBeaconStorage`, not the SDK's `ChromeStorage`: that one reads the
 * whole extension namespace on every get, which here means the encrypted vault.
 * See the header of `adapters/chrome/chrome-beacon-storage.ts`.
 */

import { WalletClient } from '@airgap/beacon-wallet';
import { Client } from '@airgap/beacon-core';
import type { Storage, TransportType } from '@airgap/beacon-types';
import { ChromeBeaconStorage } from '../../adapters/chrome/chrome-beacon-storage';
import { ExtensionPostMessageTransport, type PostToPage } from './extension-post-message';

export interface ExtensionWalletClientOptions {
  /** Shown in the dApp's pairing modal and reported as the paired peer's name. */
  name:     string;
  iconUrl?: string;
  /** Where the page-bound frames go. Injected so nothing here touches `window`. */
  postToPage: PostToPage;
  /**
   * Overridable for tests; defaults to `chrome.storage.local`. A caller that
   * omits it can never accidentally get the SDK's `LocalStorage` — the default
   * is supplied here, so `WalletClient`'s own `new LocalStorage()` fallback is
   * unreachable.
   */
  storage?: Storage;
}

export class ExtensionBeaconWalletClient extends WalletClient {
  private readonly postToPage: PostToPage;
  /** Named to avoid `Client`'s own protected `transport` getter. */
  private pageTransport: ExtensionPostMessageTransport | null = null;

  constructor(options: ExtensionWalletClientOptions) {
    super({
      name:    options.name,
      iconUrl: options.iconUrl,
      // `appUrl` is left unset, which means `BeaconClient` DOES fall back to
      // `windowRef.location.origin` (`dist/esm/clients/beacon-client/BeaconClient.js:51`)
      // — the visited page. Tolerated rather than desired: `appUrl` never reaches
      // the wire on this path (`getOwnAppMetadata` sends `{senderId, name, icon}`,
      // and `getPairingResponseInfo` sends none of it), its only consumer is the
      // `WalletP2PTransport` inside the `init()` this subclass replaces, and the
      // client is per-page — so the fallback resolves to the origin of the very
      // dApp being paired with, never a cross-site value.
      storage: options.storage ?? new ChromeBeaconStorage(),
    });
    this.postToPage = options.postToPage;
  }

  /**
   * Replace the inherited P2P boot with the extension transport. Called instead
   * of `super.init()`, never alongside it.
   */
  override async init(): Promise<TransportType> {
    this.pageTransport ??= new ExtensionPostMessageTransport(
      this.name,
      await this.keyPair,
      this.storage,
      this.postToPage,
    );
    // Deliberately `Client.prototype.init`, not `super.init` — see the header.
    return Client.prototype.init.call(this, this.pageTransport);
  }

  /** Feed one inbound encrypted frame from the page into the transport. */
  acceptEncryptedPayload(encryptedPayload: string): void {
    this.pageTransport?.acceptEncryptedPayload(encryptedPayload);
  }
}
