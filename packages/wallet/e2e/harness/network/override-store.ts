import type { CanonicalShape } from './key';
import type { RecordedResponse } from './record-store';

export interface OverrideResponse {
  status:       number;
  contentType?: string;
  body:         string;
}

type Matcher =
  | { kind: 'rest';    method: string; path: string }
  | { kind: 'jsonRpc'; method: string; firstParam?: unknown };

interface OverrideEntry {
  hostSlug:  string;
  matcher:   Matcher;
  responses: OverrideResponse[];
  cursor:    number;          // index of the next response to serve; clamped to last
}

export class OverrideStore {
  private readonly entries: OverrideEntry[] = [];

  addRest(hostSlug: string, method: string, path: string, responses: OverrideResponse[]): void {
    if (responses.length === 0) throw new Error('override requires at least one response');
    this.entries.push({
      hostSlug,
      matcher:   { kind: 'rest', method: method.toUpperCase(), path },
      responses,
      cursor:    0,
    });
  }

  addJsonRpc(hostSlug: string, method: string, responses: OverrideResponse[], firstParam?: unknown): void {
    if (responses.length === 0) throw new Error('override requires at least one response');
    this.entries.push({
      hostSlug,
      matcher:   { kind: 'jsonRpc', method, firstParam },
      responses,
      cursor:    0,
    });
  }

  /** Match by host + canonical shape. If matched, advances the cursor (clamped) and returns the response. */
  match(hostSlug: string, shape: CanonicalShape): RecordedResponse | undefined {
    for (const e of this.entries) {
      if (e.hostSlug !== hostSlug) continue;
      if (!matchesShape(e.matcher, shape)) continue;
      const idx = Math.min(e.cursor, e.responses.length - 1);
      const r   = e.responses[idx];
      e.cursor += 1;
      return {
        status:      r.status,
        contentType: r.contentType ?? 'application/json',
        body:        r.body,
      };
    }
    return undefined;
  }
}

function matchesShape(matcher: Matcher, shape: CanonicalShape): boolean {
  if (shape.kind === 'json-rpc') {
    if (matcher.kind !== 'jsonRpc' || matcher.method !== shape.method) return false;
    if (matcher.firstParam === undefined) return true;
    try {
      const params = JSON.parse(shape.params) as unknown[];
      return Array.isArray(params) && deepEqual(params[0], matcher.firstParam);
    } catch {
      return false;
    }
  }
  if (matcher.kind !== 'rest') return false;
  return matcher.method === shape.method && matcher.path === shape.path;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}
