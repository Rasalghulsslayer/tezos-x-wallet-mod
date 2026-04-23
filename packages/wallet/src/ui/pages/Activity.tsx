import type { VaultState } from '@/lib/messages';
import { Card } from '@/components/ui/card';
import { History } from 'lucide-react';
import { Header } from '../components/Header';
import { NavBar } from '../components/NavBar';

/**
 * History is not yet persisted in v0.1.0 — each signed tx only exists in the
 * RelayerProvider's in-memory `pendingOps` and disappears on SW restart.
 * This page is a placeholder explaining the limitation. A future iteration
 * will persist txs in chrome.storage and link to Blockscout / tzkt.
 */
export function Activity({ state }: { state: VaultState }) {
  if (state.status !== 'unlocked') return null;

  return (
    <div className="flex flex-col min-h-150">
      <Header state={state} />

      <main className="flex-1 p-3 space-y-3">
        <h1 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">
          Activity
        </h1>

        <Card className="flex flex-col items-center justify-center gap-2 py-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <History className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold">No activity yet</p>
          <p className="text-xs text-muted-foreground text-center max-w-[240px]">
            Transactions signed from this wallet will appear here in a future version.
          </p>
        </Card>
      </main>

      <NavBar />
    </div>
  );
}
