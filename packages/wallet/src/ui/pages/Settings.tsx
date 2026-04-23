import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react';
import type { VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { EVM_EXPLORER, TEZOS_EXPLORER } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Header } from '../components/Header';

export function Settings({ state, onLock }: { state: VaultState; onLock: () => void }) {
  const navigate             = useNavigate();
  const [pwd, setPwd]        = useState('');
  const [seed, setSeed]      = useState<string | null>(null);
  const [err,  setErr]       = useState<string | null>(null);
  const [open, setOpen]      = useState(false);
  const [shown, setShown]    = useState(false);
  const [loading, setLoad]   = useState(false);

  const reveal = async () => {
    setErr(null);
    setLoad(true);
    try {
      const mn = await sendPopupRequest<string>({ type: 'EXPORT_SEED', password: pwd });
      setSeed(mn);
      setShown(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoad(false);
    }
  };

  const close = () => {
    setOpen(false);
    setPwd('');
    setSeed(null);
    setShown(false);
    setErr(null);
  };

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onLock();
    navigate('/unlock', { replace: true });
  };

  if (state.status !== 'unlocked') return null;

  return (
    <div className="flex flex-col min-h-150">
      <Header state={state} />

      <main className="flex-1 p-4 space-y-3">
        <button onClick={() => navigate('/')} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Home
        </button>

        <h1 className="text-lg font-bold">Settings</h1>

        <Card className="space-y-3 p-3">
          <SectionTitle>Security</SectionTitle>
          <Button variant="destructive" onClick={() => setOpen(true)} className="w-full justify-start gap-2">
            <ShieldAlert className="h-4 w-4" />
            Reveal recovery phrase
          </Button>
          <Button variant="secondary" onClick={lock} className="w-full justify-start gap-2">
            <Lock className="h-4 w-4" />
            Lock wallet
          </Button>
        </Card>

        <Card className="space-y-3 p-3">
          <SectionTitle>Explorers</SectionTitle>
          <LinkRow label="Blockscout (EVM)" href={`${EVM_EXPLORER}/address/${state.evmAlias}`} />
          <Separator className="bg-border/50" />
          <LinkRow label="tzkt (Tezos L1)" href={`${TEZOS_EXPLORER}/${state.tz1}`} />
        </Card>

        <Card className="space-y-2 p-3">
          <SectionTitle>About</SectionTitle>
          <Row label="Version"  value="0.1.0" />
          <Row label="Relayer"  value="0.3.0" />
          <Row label="Network"  value="Tezos X Testnet" />
        </Card>
      </main>

      <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reveal recovery phrase</DialogTitle>
            <DialogDescription>
              Enter your password to display your 24 words. Never share them.
            </DialogDescription>
          </DialogHeader>

          {seed == null ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="reveal-pwd">Password</Label>
                <Input
                  id="reveal-pwd"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  autoFocus
                />
              </div>
              {err != null && <p className="text-xs text-red-400">{err}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative grid grid-cols-3 gap-1.5 rounded-md bg-muted p-3 font-mono text-[10px]">
                {seed.split(' ').map((w, i) => (
                  <div key={i} className="flex gap-1">
                    <span className="text-muted-foreground w-4 text-right">{i + 1}</span>
                    <span className={shown ? '' : 'blur-sm select-none'}>{w}</span>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShown(!shown)} className="w-full">
                {shown ? <><EyeOff className="h-3 w-3" /> Hide</> : <><Eye className="h-3 w-3" /> Show</>}
              </Button>
            </div>
          )}

          <DialogFooter>
            {seed == null
              ? <Button onClick={reveal} disabled={loading || pwd.length === 0}>{loading ? 'Decrypting…' : 'Reveal'}</Button>
              : <Button variant="secondary" onClick={close}>Done</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider text-brand-300">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between py-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <span>{label}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
