'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatTxHash } from '@/lib/format';

interface TransferPanelProps {
  isConnected: boolean;
  sendTransaction: (tx: { to: string; value?: string }) => Promise<string>;
  onTx: (label: string, hash: string) => void;
}

export function TransferPanel({ isConnected, sendTransaction, onTx }: TransferPanelProps) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleSend = async () => {
    if (!to || !amount) return;
    setIsPending(true);
    try {
      const weiHex = '0x' + (BigInt(Math.round(parseFloat(amount) * 1e18)).toString(16));
      const hash = await sendTransaction({ to, value: weiHex });
      onTx('transfer', hash);
      toast.success(`Transfer sent — ${formatTxHash(hash)}`, {
        action: { label: 'Copy', onClick: () => navigator.clipboard.writeText(hash) },
      });
      setTo('');
      setAmount('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      toast.error(msg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <p className="section-label">Transfer</p>

      <Input
        placeholder="Recipient: 0x…"
        value={to}
        onChange={e => setTo(e.target.value)}
        className="neon-input text-sm"
      />

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="neon-input pr-12"
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-medium"
            style={{ color: 'var(--color-muted)' }}
          >
            tez
          </span>
        </div>
        <Button
          onClick={handleSend}
          disabled={!isConnected || isPending || !to || !amount}
          title={!isConnected ? 'Connect Temple to continue' : undefined}
          className="shrink-0 font-semibold"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(109,40,217,0.9))',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            color: '#fff',
            boxShadow: (!isConnected || isPending || !to || !amount)
              ? 'none'
              : '0 0 16px rgba(139, 92, 246, 0.3)',
          }}
        >
          {isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
