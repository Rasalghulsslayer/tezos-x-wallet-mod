interface CanonicalJsonRpc {
  kind:   'json-rpc';
  method: string;
  params: string;       // canonical JSON of params
}

interface CanonicalRest {
  kind:       'rest';
  method:     string;       // HTTP method
  path:       string;
  query:      string;       // sorted "k=v&k=v"
  bodyDigest: string;       // empty for GET, hex digest of body for POST/PUT/etc.
}

export type CanonicalShape = CanonicalJsonRpc | CanonicalRest;

const HEX_LIKE = /^0x[0-9a-fA-F]+$/;

function normaliseScalar(v: unknown): unknown {
  if (typeof v === 'string' && HEX_LIKE.test(v)) return v.toLowerCase();
  return v;
}

function normaliseValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normaliseValue);
  if (v != null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = normaliseValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return normaliseScalar(v);
}

export function canonicalJsonRpc(body: string): CanonicalJsonRpc | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed == null || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.method !== 'string') return null;
    const params = normaliseValue(obj.params ?? []);
    return {
      kind:   'json-rpc',
      method: obj.method,
      params: JSON.stringify(params),
    };
  } catch {
    return null;
  }
}

export function canonicalRest(method: string, fullPath: string, body?: string): CanonicalRest {
  const [path, queryRaw = ''] = fullPath.split('?', 2);
  const params = new URLSearchParams(queryRaw);
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => entries.push([key, value]));
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = entries.map(([k, v]) => `${k}=${v}`).join('&');
  return {
    kind:   'rest',
    method: method.toUpperCase(),
    path,
    query,
    bodyDigest: body != null && body.length > 0 ? digest(body) : '',
  };
}

export function canonicalKey(shape: CanonicalShape): string {
  if (shape.kind === 'json-rpc') {
    return `JSON-RPC ${shape.method} ${shape.params}`;
  }
  const base = `${shape.method} ${shape.path}${shape.query.length > 0 ? `?${shape.query}` : ''}`;
  return shape.bodyDigest.length > 0 ? `${base} #${shape.bodyDigest}` : base;
}

function digest(s: string): string {
  // FNV-1a 32-bit, plenty for differentiating bodies within a host.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
