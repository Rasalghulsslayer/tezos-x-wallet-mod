import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Globe, Link2, XCircle } from 'lucide-react';
import type { PendingRequest } from '@/lib/messages';
import { sendApproveRequest } from '@/lib/messaging';
import { shortAddr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '../components/Spinner';

export function Approve() {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState<'approve' | 'reject' | null>(null);

  const requestId = useMemo(() => new URLSearchParams(window.location.search).get('requestId') ?? '', []);

  useEffect(() => {
    if (requestId === '') {
      setError('Missing requestId in URL');
      return;
    }
    sendApproveRequest<PendingRequest>({ type: 'GET_PENDING', requestId })
      .then(setPending)
      .catch((e: Error) => setError(e.message));
  }, [requestId]);

  const respond = async (decision: 'approve' | 'reject') => {
    setBusy(decision);
    try {
      await sendApproveRequest({ type: 'RESOLVE_PENDING', requestId, decision });
      window.close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  if (error != null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-3">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="secondary" onClick={() => window.close()}>Close</Button>
      </div>
    );
  }

  if (pending == null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen p-4 gap-3 max-w-md mx-auto">
      {pending.kind === 'connect' ? <ConnectView origin={pending.origin} /> : <TxView pending={pending} />}

      <div className="grid grid-cols-2 gap-2 mt-auto">
        <Button
          variant="destructive"
          onClick={() => respond('reject')}
          disabled={busy !== null}
          className="gap-2"
        >
          <XCircle className="h-4 w-4" />
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
        <Button
          onClick={() => respond('approve')}
          disabled={busy !== null}
          className="gap-2"
        >
          <CheckCircle2 className="h-4 w-4" />
          {busy === 'approve' ? 'Signing…' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}

function ConnectView({ origin }: { origin: string }) {
  const hostname = useMemo(() => {
    try { return new URL(origin).hostname; }
    catch { return origin; }
  }, [origin]);

  return (
    <>
      <header className="flex flex-col items-center gap-2 pt-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
          <Link2 className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold">Connection request</h1>
      </header>

      <Card className="gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{hostname}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          This site wants to see your EVM alias and request transactions through your wallet.
          You'll be asked to approve each transaction individually.
        </p>
      </Card>
    </>
  );
}

function TxView({ pending }: { pending: Extract<PendingRequest, { kind: 'transaction' }> }) {
  const hostname = useMemo(() => {
    try { return new URL(pending.origin).hostname; }
    catch { return pending.origin; }
  }, [pending.origin]);

  return (
    <>
      <header className="flex flex-col items-center gap-2 pt-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-tz/10 text-cyan-tz">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold">Signature request</h1>
        <p className="text-xs text-muted-foreground">from {hostname}</p>
      </header>

      <Card className="space-y-2 p-3">
        <Row label="To"     value={shortAddr(pending.to, 8, 6)} mono />
        <Row label="Value"  value={pending.value} mono />
        <Row label="Data"   value={pending.data === '0x' ? '(empty)' : shortAddr(pending.data, 10, 6)} mono />
        {pending.methodSig && <Row label="Method" value={pending.methodSig} mono />}
      </Card>

      <p className="text-[10px] text-center text-muted-foreground px-4">
        This transaction will be signed with your Tezos key and routed through the NAC gateway.
      </p>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
