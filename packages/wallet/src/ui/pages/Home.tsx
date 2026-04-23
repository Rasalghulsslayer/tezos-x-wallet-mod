import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send as SendIcon, Droplets, RefreshCw } from 'lucide-react';
import type { VaultState } from '@/lib/messages';
import { fetchXtzBalance, fetchErc20Balance } from '@/lib/balances';
import { USDC_CONTRACT, FAUCET_URL } from '@/lib/constants';
import { weiToXtz, formatUsdc } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '../components/Header';
import { NavBar } from '../components/NavBar';
import { Spinner } from '../components/Spinner';

interface Balances {
  xtz:  string;
  usdc: string;
}

export function Home({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const navigate = useNavigate();
  const [bal, setBal]     = useState<Balances | null>(null);
  const [loading, setLd]  = useState(true);
  const [error,   setErr] = useState<string | null>(null);

  const refresh = async () => {
    if (state.status !== 'unlocked') return;
    setLd(true);
    setErr(null);
    try {
      const [xtzHex, usdcHex] = await Promise.all([
        fetchXtzBalance(state.evmAlias),
        fetchErc20Balance(USDC_CONTRACT, state.evmAlias),
      ]);
      setBal({ xtz: weiToXtz(xtzHex), usdc: formatUsdc(usdcHex) });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLd(false);
    }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [state.status]);

  if (state.status !== 'unlocked') return null;

  return (
    <div className="flex flex-col min-h-150">
      <Header state={state} onLocked={onChanged} />

      <main className="flex-1 p-3 space-y-3">
        <Card className="gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Balances</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={refresh}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loading && bal == null ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : error != null ? (
            <p className="text-xs text-red-400 py-2">{error}</p>
          ) : bal != null ? (
            <div className="space-y-2">
              <BalanceRow label="XTZ"   value={bal.xtz}  badge="L1 + EVM" tone="brand" />
              <BalanceRow label="USDC"  value={bal.usdc} badge="Tezlink EVM" tone="cyan" />
            </div>
          ) : null}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => navigate('/send')} className="h-16 flex-col gap-1">
            <SendIcon className="h-4 w-4" />
            Send
          </Button>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="h-16 flex-col gap-1 inline-flex items-center justify-center rounded-md border border-brand-500/30 bg-brand-500/5 text-brand-300 text-sm font-semibold hover:border-brand-500/60 hover:bg-brand-500/10 transition-colors"
          >
            <Droplets className="h-4 w-4" />
            Faucet
          </a>
        </div>
      </main>

      <NavBar />
    </div>
  );
}

function BalanceRow({ label, value, badge, tone }: {
  label: string;
  value: string;
  badge: string;
  tone:  'brand' | 'cyan';
}) {
  const cls = tone === 'brand' ? 'text-brand-300 bg-brand-500/10' : 'text-cyan-tz bg-cyan-tz/10';
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-mono text-base font-semibold">{value}</div>
      </div>
      <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${cls}`}>{badge}</span>
    </div>
  );
}
