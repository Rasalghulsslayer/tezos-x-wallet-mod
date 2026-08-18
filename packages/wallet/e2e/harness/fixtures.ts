import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, type BrowserContext, type Worker } from '@playwright/test';

import { launchExtensionContext, closeExtensionContext, type ExtensionHandles } from './extension';
import { installMockRouter, installNetworkDownRouter } from './network/mock-router';
import { OverrideStore, type OverrideResponse } from './network/override-store';
import { installDappRoute } from './pages/dapp-page';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const FIXTURES_VAULT_DIR = resolve(__dirname, '../fixtures/vault');

function specSlugOf(testFile: string): string {
  return basename(testFile, '.spec.ts');
}

interface TestSeed {
  mnemonic:    string;
  password:    string;
  expectedTz1: string;
  warning:     string;
}

interface EncryptedVaultFixture {
  ciphertext: string;
  iv:         string;
  salt:       string;
  iterations: number;
}

interface RestMatcherApi {
  respond:        (response: OverrideResponse) => void;
  respondSequence: (responses: OverrideResponse[]) => void;
}

interface RpcMatcherApi {
  respond:        (response: OverrideResponse) => void;
  respondSequence: (responses: OverrideResponse[]) => void;
}

interface RpcMatcherOptions {
  /** Restrict the override to calls where the first JSON-RPC param deep-equals this value. */
  firstParam?: unknown;
}

export interface MockBuilder {
  tzkt:        (matcher: string) => RestMatcherApi;
  michelson:   (matcher: string) => RestMatcherApi;
  blockscout:  (matcher: string) => RestMatcherApi;
  /** JSON-RPC matcher: pass the method name (e.g. `'eth_getTransactionReceipt'`). */
  tezlinkEvm:  (jsonRpcMethod: string, options?: RpcMatcherOptions) => RpcMatcherApi;
}

function makeMockBuilder(store: OverrideStore): MockBuilder {
  function rest(host: string, matcher: string): RestMatcherApi {
    const m = matcher.match(/^(\S+)\s+(.+)$/);
    if (m == null) throw new Error(`Invalid REST matcher "${matcher}", expected "METHOD /path"`);
    const [, method, path] = m;
    return {
      respond:        (r) => store.addRest(host, method, path, [r]),
      respondSequence: (rs) => store.addRest(host, method, path, rs),
    };
  }
  return {
    tzkt:       (m: string) => rest('tzkt', m),
    michelson:  (m: string) => rest('michelson', m),
    blockscout: (m: string) => rest('blockscout', m),
    tezlinkEvm: (rpcMethod: string, options?: RpcMatcherOptions) => ({
      respond:        (r)  => store.addJsonRpc('tezlink-evm', rpcMethod, [r], options?.firstParam),
      respondSequence: (rs) => store.addJsonRpc('tezlink-evm', rpcMethod, rs, options?.firstParam),
    }),
  };
}

export interface HarnessOptions {
  /**
   * Opt-in per spec via `test.use({ networkDown: true })`: the context comes
   * up with every http(s) request aborted (net::ERR_INTERNET_DISCONNECTED)
   * from the very start, simulating a machine with no internet access. The
   * record/replay mock router and the local test-dapp route are NOT installed
   * — an offline spec has no network fixtures and RECORD=1 is a no-op for it.
   * The `mock` builder is inert under this option.
   */
  networkDown: boolean;
}

export interface ExtensionFixtures {
  overrideStore:    OverrideStore;
  mock:             MockBuilder;
  extensionContext: BrowserContext;
  serviceWorker:    Worker;
  extensionId:      string;
  testSeed:         TestSeed;
  testVault:        EncryptedVaultFixture;
}

export const test = base.extend<ExtensionFixtures & HarnessOptions>({
  networkDown: [false, { option: true }],

  overrideStore: async ({}, use) => {
    await use(new OverrideStore());
  },

  mock: async ({ overrideStore }, use) => {
    await use(makeMockBuilder(overrideStore));
  },

  extensionContext: async ({ overrideStore, networkDown }, use, testInfo) => {
    const handles: ExtensionHandles = await launchExtensionContext();
    if (networkDown) {
      await installNetworkDownRouter(handles.context);
    } else {
      await installMockRouter(handles.context, {
        specSlug:  specSlugOf(testInfo.file),
        overrides: overrideStore,
      });
      await installDappRoute(handles.context);
    }
    await use(handles.context);
    await closeExtensionContext(handles);
  },

  serviceWorker: async ({ extensionContext }, use) => {
    const sw = extensionContext.serviceWorkers()[0];
    if (sw == null) throw new Error('Extension context has no service worker');
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const m = /^chrome-extension:\/\/([a-z]+)\//.exec(serviceWorker.url());
    if (m == null) throw new Error(`Cannot parse extension id from ${serviceWorker.url()}`);
    await use(m[1]);
  },

  testSeed: async ({}, use) => {
    const raw  = readFileSync(resolve(FIXTURES_VAULT_DIR, 'seed.json'), 'utf-8');
    const seed = JSON.parse(raw) as TestSeed;
    await use(seed);
  },

  testVault: async ({}, use) => {
    const raw   = readFileSync(resolve(FIXTURES_VAULT_DIR, 'vault-v2.encrypted.json'), 'utf-8');
    const vault = JSON.parse(raw) as EncryptedVaultFixture;
    await use(vault);
  },
});

export { expect } from '@playwright/test';
