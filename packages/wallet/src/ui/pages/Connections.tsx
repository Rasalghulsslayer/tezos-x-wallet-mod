import { useEffect, useState } from 'react';
import { Globe, Unplug, Clock } from 'lucide-react';
import type { StoredSession, VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { timeAgo } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '../components/Header';
import { NavBar } from '../components/NavBar';
import { Spinner } from '../components/Spinner';

export function Connections({ state, onChanged }: { state: VaultState; onChanged: () => void }) {
  const [sessions, setSessions] = useState<StoredSession[] | null>(null);

  const refresh = async () => {
    const list = await sendPopupRequest<StoredSession[]>({ type: 'LIST_SESSIONS' });
    setSessions(list);
  };

  useEffect(() => { void refresh(); }, []);

  const disconnect = async (origin: string) => {
    await sendPopupRequest({ type: 'DISCONNECT', origin });
    await refresh();
    onChanged();
  };

  if (state.status !== 'unlocked') return null;

  return (
    <div className="flex flex-col min-h-150">
      <Header state={state} />

      <main className="flex-1 p-3 space-y-2">
        <h1 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">
          Connected sites
        </h1>

        {sessions == null ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : sessions.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 py-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Globe className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold">No connected sites</p>
            <p className="text-xs text-muted-foreground text-center max-w-[240px]">
              Visit a dApp and approve the connection — it will appear here.
            </p>
          </Card>
        ) : (
          sessions.map((s) => (
            <Card key={s.origin} className="gap-2 p-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" title={s.origin}>
                    {new URL(s.origin).hostname}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo(s.connectedAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7"
                  onClick={() => disconnect(s.origin)}
                >
                  <Unplug className="h-3 w-3" />
                  Disconnect
                </Button>
              </div>
            </Card>
          ))
        )}
      </main>

      <NavBar />
    </div>
  );
}
