import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Settings, Wallet as WalletIcon, Check, Copy } from 'lucide-react';
import { shortAddr } from '@/lib/format';
import { sendPopupRequest } from '@/lib/messaging';
import type { VaultState } from '@/lib/messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function Header({ state, onLocked }: { state: VaultState; onLocked?: () => void }) {
  const navigate         = useNavigate();
  const [copied, setCpd] = useState<'tz1' | 'evm' | null>(null);

  const copy = async (label: 'tz1' | 'evm', value: string) => {
    await navigator.clipboard.writeText(value);
    setCpd(label);
    setTimeout(() => setCpd(null), 1500);
  };

  const lock = async () => {
    await sendPopupRequest({ type: 'LOCK' });
    onLocked?.();
  };

  if (state.status !== 'unlocked') return null;

  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
            <WalletIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold leading-none bg-gradient-to-r from-white to-brand-300 bg-clip-text text-transparent">
              TezosX
            </div>
            <div className="text-[9px] text-muted-foreground font-mono leading-none mt-0.5">v0.1.0</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-testnet border-testnet/40 bg-testnet/10 h-5 text-[9px]">
            TESTNET
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate('/settings')}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={lock}>
            <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 border-t border-border">
        <button
          onClick={() => copy('tz1', state.tz1)}
          className="flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-mono text-muted-foreground hover:text-foreground border-r border-border"
          title={state.tz1}
        >
          <span className="font-sans text-[9px] uppercase tracking-wider text-brand-300">tz1</span>
          <span>{shortAddr(state.tz1, 5, 4)}</span>
          {copied === 'tz1' ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        </button>
        <button
          onClick={() => copy('evm', state.evmAlias)}
          className="flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-mono text-muted-foreground hover:text-foreground"
          title={state.evmAlias}
        >
          <span className="font-sans text-[9px] uppercase tracking-wider text-cyan-tz">evm</span>
          <span>{shortAddr(state.evmAlias, 5, 4)}</span>
          {copied === 'evm' ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </header>
  );
}
