import { useNavigate } from 'react-router-dom';
import { Wallet, Plus, DownloadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function Welcome({ onDone: _onDone }: { onDone: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-150 gap-6 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/20 to-cyan-tz/20 text-brand-300">
        <Wallet className="h-8 w-8" />
      </div>

      <div className="text-center">
        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-brand-300 bg-clip-text text-transparent">
          TezosX Wallet
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your Tezos keys, your Etherlink dApps.
        </p>
      </div>

      <Card className="w-full gap-3 p-4">
        <Button className="w-full justify-start gap-3" onClick={() => navigate('/create')}>
          <Plus className="h-4 w-4" />
          Create a new wallet
        </Button>
        <Button variant="secondary" className="w-full justify-start gap-3" onClick={() => navigate('/import')}>
          <DownloadCloud className="h-4 w-4" />
          Import an existing seed
        </Button>
      </Card>

      <p className="text-[10px] text-muted-foreground max-w-xs text-center">
        Testnet only — never enter a mainnet seed.
      </p>
    </div>
  );
}
