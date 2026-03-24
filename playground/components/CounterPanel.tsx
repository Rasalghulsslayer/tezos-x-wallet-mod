'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, Plus, Minus, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CounterPanelProps {
  isConnected: boolean;
  counterValue: bigint | null;
  isLoadingValue: boolean;
  pendingAction: string | null;
  onRefresh: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onSetNumber: (n: bigint) => void;
}

export function CounterPanel({
  isConnected, counterValue, isLoadingValue, pendingAction,
  onRefresh, onIncrement, onDecrement, onSetNumber,
}: CounterPanelProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSetNumber = () => {
    const num = BigInt(inputValue || '0');
    onSetNumber(num);
    setInputValue('');
  };

  const disabled = (action: string) => !isConnected || pendingAction === action;
  const loading = (action: string) => pendingAction === action;

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label">Counter Contract</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            0x7b0e325F…D7b
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md"
          style={{ color: 'var(--color-muted)', background: 'rgba(139,92,246,0.06)' }}
          onClick={onRefresh}
          disabled={isLoadingValue}
          title="Refresh value"
        >
          <RefreshCw className={`h-3 w-3 ${isLoadingValue ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Counter display */}
      <div
        className="relative flex items-center justify-between rounded-xl px-5 py-4 overflow-hidden"
        style={{
          background: 'rgba(139, 92, 246, 0.06)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          boxShadow: counterValue !== null ? '0 0 30px rgba(139, 92, 246, 0.08) inset' : 'none',
        }}
      >
        <span className="section-label">Current value</span>
        <span
          className="font-mono text-4xl font-bold tabular-nums"
          style={{
            color: 'var(--color-accent-2)',
            fontFamily: 'JetBrains Mono, monospace',
            textShadow: counterValue !== null ? '0 0 24px rgba(167, 139, 250, 0.6)' : 'none',
          }}
        >
          {counterValue !== null ? counterValue.toString() : '—'}
        </span>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onIncrement}
          disabled={disabled('increment')}
          title={!isConnected ? 'Connect Temple to continue' : undefined}
          variant="outline"
          className="font-medium transition-all"
          style={{
            background: 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            color: 'var(--color-accent-2)',
          }}
        >
          {loading('increment')
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Plus className="mr-2 h-4 w-4" />}
          Increment
        </Button>
        <Button
          onClick={onDecrement}
          disabled={disabled('decrement')}
          title={!isConnected ? 'Connect Temple to continue' : undefined}
          variant="outline"
          className="font-medium transition-all"
          style={{
            background: 'rgba(255, 51, 85, 0.06)',
            border: '1px solid rgba(255, 51, 85, 0.2)',
            color: 'var(--color-red)',
          }}
        >
          {loading('decrement')
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Minus className="mr-2 h-4 w-4" />}
          Decrement
        </Button>
      </div>

      {/* Set number */}
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Set to a specific value…"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="neon-input flex-1 text-sm"
        />
        <Button
          onClick={handleSetNumber}
          disabled={disabled('setNumber') || !inputValue}
          title={!isConnected ? 'Connect Temple to continue' : undefined}
          variant="outline"
          className="shrink-0"
          style={{
            background: 'rgba(34, 211, 238, 0.07)',
            border: '1px solid rgba(34, 211, 238, 0.25)',
            color: 'var(--color-cyan)',
          }}
        >
          {loading('setNumber')
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Hash className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
