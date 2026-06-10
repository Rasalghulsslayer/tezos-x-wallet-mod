import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext, Route, Request } from '@playwright/test';

import { canonicalJsonRpc, canonicalKey, canonicalRest, type CanonicalShape } from './key';
import { OverrideStore } from './override-store';
import { appendRecording, getRecording, type RecordedResponse } from './record-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
export const FIXTURES_NETWORK_ROOT = resolve(__dirname, '../../fixtures/network');

const HOST_TO_SLUG: Readonly<Record<string, string>> = {
  'evm.previewnet.tezosx.nomadic-labs.com':        'tezlink-evm',
  'michelson.previewnet.tezosx.nomadic-labs.com':  'michelson',
  'api.previewnet.tezosx.tzkt.io':                 'tzkt',
  'blockscout.previewnet.tezosx.nomadic-labs.com': 'blockscout',
};

// Hosts the wallet may hit incidentally (fonts, etc.). We don't record them
// because they have no impact on wallet logic; we abort silently so they don't
// reach the network in CI but don't spam the unhandled-host warning either.
const SILENTLY_IGNORED_HOSTS: ReadonlySet<string> = new Set([
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

export type MockMode = 'replay' | 'record';

export function currentMockMode(): MockMode {
  return process.env.RECORD === '1' ? 'record' : 'replay';
}

export interface MockRouterOptions {
  /** Per-spec subdirectory under fixtures/network (e.g. "010-tz1-to-tz1"). */
  specSlug:  string;
  /** Test-scoped store consulted before falling back to recorded fixtures. */
  overrides: OverrideStore;
}

export async function installMockRouter(context: BrowserContext, options: MockRouterOptions): Promise<void> {
  const mode = currentMockMode();
  const fixturesDir = resolve(FIXTURES_NETWORK_ROOT, options.specSlug);
  await context.route('**', async (route, request) => {
    await dispatch(route, request, mode, fixturesDir, options.overrides);
  });
}

async function dispatch(route: Route, request: Request, mode: MockMode, fixturesDir: string, overrides: OverrideStore): Promise<void> {
  const url   = new URL(request.url());
  const host  = url.hostname;
  const slug  = HOST_TO_SLUG[host];

  if (slug != null) {
    await handleKnownHost(route, request, slug, mode, fixturesDir, overrides);
    return;
  }

  if (
    request.url().startsWith('chrome-extension://') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    await route.continue();
    return;
  }

  if (SILENTLY_IGNORED_HOSTS.has(host)) {
    try { await route.abort('failed'); } catch { /* context closed mid-abort */ }
    return;
  }

  console.warn(`[mock-router] unhandled host: ${host} (${request.url()})`);
  try { await route.abort('failed'); } catch { /* context closed mid-abort */ }
}

async function handleKnownHost(route: Route, request: Request, slug: string, mode: MockMode, fixturesDir: string, overrides: OverrideStore): Promise<void> {
  const shape = await shapeOf(request);
  if (shape == null) {
    console.warn(`[mock-router] could not derive canonical shape for ${request.url()}`);
    await route.abort('failed');
    return;
  }

  // Test-scoped overrides win over recorded fixtures so specs can script
  // dynamic-state pollers (broadcasting → included → finalized) deterministically.
  const overridden = overrides.match(slug, shape);
  if (overridden != null) {
    await fulfillFrom(route, overridden);
    return;
  }

  const key      = canonicalKey(shape);
  const filePath = resolve(fixturesDir, slug, 'recordings.json');

  const replay = getRecording(filePath, key);
  if (replay != null) {
    await fulfillFrom(route, replay);
    return;
  }

  if (mode === 'replay') {
    console.error(`[mock-router] fixture missing in ${slug}: ${key}`);
    await route.abort('failed');
    return;
  }

  await captureAndFulfill(route, request, filePath, key);
}

async function shapeOf(request: Request): Promise<CanonicalShape | null> {
  const url    = new URL(request.url());
  const method = request.method();
  const body   = method === 'GET' || method === 'HEAD' ? '' : (request.postData() ?? '');
  if (method === 'POST' && body.length > 0) {
    const rpc = canonicalJsonRpc(body);
    if (rpc != null) return rpc;
  }
  return canonicalRest(method, `${url.pathname}${url.search}`, body);
}

async function fulfillFrom(route: Route, response: RecordedResponse): Promise<void> {
  await route.fulfill({
    status:      response.status,
    contentType: response.contentType,
    body:        response.body,
  });
}

async function captureAndFulfill(route: Route, request: Request, filePath: string, key: string): Promise<void> {
  try {
    const real = await route.fetch();
    const status = real.status();
    if (status < 200 || status >= 300) {
      console.warn(`[mock-router] record skipped non-2xx (${status}) for ${key}`);
      await route.fulfill({ response: real });
      return;
    }
    const buf  = await real.body();
    const body = buf.toString('utf-8');
    const contentType = real.headers()['content-type'] ?? 'application/octet-stream';
    appendRecording(filePath, key, { status, contentType, body });
    await route.fulfill({ status, contentType, body });
  } catch (e) {
    if (isContextClosedError(e)) return;
    console.error(`[mock-router] record fetch failed for ${request.url()}:`, e);
    try { await route.abort('failed'); } catch { /* context closed mid-abort */ }
  }
}

function isContextClosedError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message;
  return m.includes('Target page, context or browser has been closed')
      || m.includes('Target closed')
      || m.includes('Response has been disposed')
      || m.includes('Request context disposed');
}
