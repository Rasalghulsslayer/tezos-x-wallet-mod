'use client';

import QRCode from 'react-qr-code';
import { Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface WcPairingProps {
  uri:       string;
  onDismiss: () => void;
}

/**
 * Renders the WalletConnect pairing URI while a session proposal waits for the
 * mobile wallet: a QR code to scan, plus a copy button feeding the wallet's
 * paste-a-link sheet. Dismissing only hides the block — the pending proposal
 * stays valid until it expires (~5 min) or the wallet answers.
 */
export function WcPairing({ uri, onDismiss }: WcPairingProps) {
  return (
    <div
      className="space-y-3 rounded-md px-3 py-3"
      style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.18)' }}
    >
      <div className="flex items-center justify-between">
        <p className="section-label">Pair the mobile wallet</p>
        <button onClick={onDismiss} aria-label="Hide QR code" className="opacity-50 hover:opacity-100 transition-opacity">
          <X className="h-3.5 w-3.5" style={{ color: 'var(--color-muted)' }} />
        </button>
      </div>

      {/* White backing + padding: the page theme is dark and scanners need
          contrast and a quiet zone around the code. */}
      <div className="mx-auto w-fit rounded-md bg-white p-3">
        <QRCode value={uri} size={200} />
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
        Tezos X Mobile → Connections → scan this code, or paste the copied wc: link.
      </p>

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => { void navigator.clipboard.writeText(uri); toast.success('Pairing URI copied'); }}
      >
        <Copy className="mr-2 h-3 w-3" />Copy pairing URI
      </Button>
    </div>
  );
}
