import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RecordedResponse {
  status:      number;
  contentType: string;
  body:        string;
}

export interface HostRecordings {
  _meta: { fixturesVersion: number };
  entries: Record<string, RecordedResponse>;
}

const CURRENT_FIXTURES_VERSION = 1;

const cache = new Map<string, HostRecordings>();

export function loadRecordings(filePath: string): HostRecordings {
  const cached = cache.get(filePath);
  if (cached != null) return cached;

  if (!existsSync(filePath)) {
    const empty: HostRecordings = {
      _meta:   { fixturesVersion: CURRENT_FIXTURES_VERSION },
      entries: {},
    };
    cache.set(filePath, empty);
    return empty;
  }

  const raw    = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as HostRecordings;
  if (parsed._meta?.fixturesVersion !== CURRENT_FIXTURES_VERSION) {
    throw new Error(`Recordings at ${filePath} have unsupported fixturesVersion=${parsed._meta?.fixturesVersion} (expected ${CURRENT_FIXTURES_VERSION})`);
  }
  cache.set(filePath, parsed);
  return parsed;
}

export function getRecording(filePath: string, key: string): RecordedResponse | undefined {
  return loadRecordings(filePath).entries[key];
}

/**
 * Last-wins capture: when the same canonical key is hit multiple times during a
 * RECORD run (typically because the wallet polls a status endpoint), we keep
 * the most recent response. Without this, a status poller captures the initial
 * empty/loading reply instead of the eventual finalized one — REPLAY then never
 * progresses past the loading state.
 */
export function appendRecording(filePath: string, key: string, response: RecordedResponse): void {
  const recs = loadRecordings(filePath);
  recs.entries[key] = response;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(recs, null, 2)}\n`, 'utf-8');
}
