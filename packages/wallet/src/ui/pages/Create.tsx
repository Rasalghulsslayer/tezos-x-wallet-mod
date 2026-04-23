import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Copy, Check, ShieldCheck } from 'lucide-react';
import { newMnemonic } from '@/lib/seed';
import { sendPopupRequest } from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage = 'seed' | 'confirm' | 'password';

export function Create({ onDone }: { onDone: () => void }) {
  const navigate            = useNavigate();
  const [stage, setStage]   = useState<Stage>('seed');
  const [mnemonic]          = useState(() => newMnemonic());
  const [confirmOk, setOk]  = useState(false);
  const [password, setPwd]  = useState('');
  const [confirm,  setCnf]  = useState('');
  const [error,    setErr]  = useState<string | null>(null);
  const [loading,  setLoad] = useState(false);
  const [copied,   setCpd]  = useState(false);

  const words = useMemo(() => mnemonic.split(' '), [mnemonic]);

  const copy = async () => {
    await navigator.clipboard.writeText(mnemonic);
    setCpd(true);
    setTimeout(() => setCpd(false), 1500);
  };

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr('Password must be at least 8 characters');
    if (password !== confirm) return setErr('Passwords do not match');

    setLoad(true);
    try {
      await sendPopupRequest({ type: 'CREATE_WALLET', mnemonic, password });
      onDone();
      navigate('/', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="flex flex-col min-h-150 p-4 gap-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      {stage === 'seed' && (
        <>
          <header>
            <h1 className="text-lg font-bold">Your recovery phrase</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Write these 24 words down. They are the only way to restore your wallet.
            </p>
          </header>

          <Card className="p-3">
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
              {words.map((w, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5">
                  <span className="text-muted-foreground w-4 text-right">{i + 1}</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </Card>

          <Button variant="secondary" onClick={copy} className="w-full">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy to clipboard'}
          </Button>

          <div className="flex items-start gap-2 rounded-lg border border-testnet/30 bg-testnet/5 p-3 text-[11px] text-testnet">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            Anyone with this phrase can access your wallet. Never share it.
          </div>

          <Button onClick={() => setStage('confirm')} className="w-full mt-auto">
            I have saved my phrase
          </Button>
        </>
      )}

      {stage === 'confirm' && (
        <>
          <header>
            <h1 className="text-lg font-bold">Confirm</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Check the box once you've safely stored your recovery phrase.
            </p>
          </header>

          <Card className="p-3 flex-1 flex items-center justify-center">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmOk}
                onChange={(e) => setOk(e.target.checked)}
                className="h-5 w-5 rounded border-border bg-transparent text-brand-500 focus:ring-brand-500"
              />
              <span className="text-sm">I have written down my 24 words and stored them securely.</span>
            </label>
          </Card>

          <Button onClick={() => setStage('password')} disabled={!confirmOk} className="w-full">
            Continue
          </Button>
        </>
      )}

      {stage === 'password' && (
        <>
          <header className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-300" />
            <h1 className="text-lg font-bold">Set a password</h1>
          </header>
          <p className="text-xs text-muted-foreground -mt-2">
            Encrypts your seed on this device. Required at every browser restart.
          </p>

          <div className="space-y-3">
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPwd(e.target.value)} placeholder="At least 8 characters" autoFocus />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setCnf(e.target.value)} />
            </div>
            {error != null && <p className="text-xs text-red-400">{error}</p>}
          </div>

          <Button onClick={submit} disabled={loading} className="w-full mt-auto">
            {loading ? 'Creating…' : 'Create wallet'}
          </Button>
        </>
      )}
    </div>
  );
}
