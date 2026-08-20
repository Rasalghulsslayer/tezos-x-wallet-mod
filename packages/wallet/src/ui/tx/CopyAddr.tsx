import { useState, type MouseEvent } from 'react';
import { Icon } from './Icon';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { toast } from './Toast';

export function CopyAddr({
  addr,
  len = 4,
  small = false,
}: {
  addr: string;
  len?: number;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const doCopy = (e: MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(addr);
    setCopied(true);
    toast('Address copied');
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span
      className="tx-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: small ? 11 : 13,
        cursor: 'pointer',
      }}
      onClick={doCopy}
    >
      {shortAddr(addr, len + 3, len)}
      <Icon name={copied ? 'check' : 'copy'} size={12} color={copied ? 'var(--tx-success)' : 'var(--tx-fg-muted)'} />
    </span>
  );
}
