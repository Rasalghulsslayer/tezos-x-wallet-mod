import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '../components/Header';

type Stage = 'form' | 'review' | 'sent';

const TZ_ADDR_RE  = /^(tz[1234]|KT1)[a-zA-Z0-9]{33}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function xtzToHexWei(xtz: string): string {
  // 1 tez = 10^18 wei (gateway divides by 10^12 to mutez)
  const [whole, frac = ''] = xtz.trim().split('.');
  const padded = (whole + frac.padEnd(18, '0')).slice(0, whole.length + 18);
  const big = BigInt(padded);
  return '0x' + big.toString(16);
}

export function Send({ state, onDone }: { state: VaultState; onDone: () => void }) {
  const navigate          = useNavigate();
  const [to, setTo]       = useState('');
  const [amount, setAmt]  = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [error,   setErr] = useState<string | null>(null);
  const [loading, setLd]  = useState(false);
  const [txHash,  setHash] = useState<string | null>(null);

  if (state.status !== 'unlocked') return null;

  const validate = (): string | null => {
    if (!TZ_ADDR_RE.test(to) && !EVM_ADDR_RE.test(to)) return 'Destination must be a tz1, tz2, tz3, KT1 or 0x address';
    if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) return 'Amount must be a positive number';
    return null;
  };

  const review = () => {
    setErr(null);
    const err = validate();
    if (err != null) { setErr(err); return; }
    setStage('review');
  };

  const submit = async () => {
    setLd(true);
    setErr(null);
    try {
      const hash = await sendPopupRequest<string>({
        type:   'SEND_TX',
        to,
        amount: xtzToHexWei(amount),
        asset:  'XTZ',
      });
      setHash(hash);
      setStage('sent');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setStage('form');
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="flex flex-col min-h-150">
      <Header state={state} onLocked={onDone} />

      <main className="flex-1 p-4 space-y-3 flex flex-col">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="h-3 w-3" /> Back
        </button>

        {stage === 'form' && (
          <>
            <header>
              <h1 className="text-lg font-bold">Send XTZ</h1>
              <p className="text-xs text-muted-foreground mt-1">
                Routes through the NAC gateway.
              </p>
            </header>

            <div className="space-y-3 flex-1">
              <div>
                <Label htmlFor="to">Destination</Label>
                <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="tz1… or 0x…" className="font-mono" />
              </div>
              <div>
                <Label htmlFor="amount">Amount (XTZ)</Label>
                <Input id="amount" value={amount} onChange={(e) => setAmt(e.target.value)} placeholder="0.0" inputMode="decimal" />
              </div>
              {error != null && <p className="text-xs text-red-400">{error}</p>}
            </div>

            <Button onClick={review} className="w-full">Review</Button>
          </>
        )}

        {stage === 'review' && (
          <>
            <header>
              <h1 className="text-lg font-bold">Review transaction</h1>
            </header>

            <Card className="gap-3">
              <Row label="From"    value={state.evmAlias} mono />
              <Row label="To"      value={to}             mono />
              <Row label="Amount"  value={`${amount} XTZ`} />
              <Row label="Network" value="Tezos X Testnet · via NAC" />
            </Card>

            {error != null && <p className="text-xs text-red-400">{error}</p>}

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <Button variant="secondary" onClick={() => setStage('form')} disabled={loading}>
                Edit
              </Button>
              <Button onClick={submit} disabled={loading}>
                {loading ? 'Signing…' : 'Confirm & sign'}
              </Button>
            </div>
          </>
        )}

        {stage === 'sent' && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="text-lg font-bold">Transaction sent</h1>
              <p className="font-mono text-[10px] text-muted-foreground break-all text-center px-4">
                {txHash}
              </p>
            </div>

            <Button onClick={() => navigate('/')} className="w-full">Back to home</Button>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
