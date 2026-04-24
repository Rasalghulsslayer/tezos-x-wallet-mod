import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { AssetMark } from '../tx/AssetMark';
import { ChainPill } from '../tx/ChainPill';
import { Line } from '../tx/Line';
import { truncAddr } from '../tx/utils';

type Stage = 'form' | 'review' | 'sending' | 'done';
type Asset = 'XTZ' | 'USDC';

const TZ_ADDR_RE  = /^(tz[1234]|KT1)[a-zA-Z0-9]{33}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function xtzToHexWei(xtz: string): string {
  const [whole, frac = ''] = xtz.trim().split('.');
  const padded = (whole + frac.padEnd(18, '0')).slice(0, whole.length + 18);
  const big = BigInt(padded);
  return '0x' + big.toString(16);
}

export function Send({ state, onDone }: { state: VaultState; onDone: () => void }) {
  const navigate = useNavigate();
  const [asset,  setAsset] = useState<Asset>('XTZ');
  const [to,     setTo]    = useState('');
  const [amount, setAmt]   = useState('');
  const [stage,  setStage] = useState<Stage>('form');
  const [error,  setErr]   = useState<string | null>(null);
  const [txHash, setHash]  = useState<string | null>(null);

  if (state.status !== 'unlocked') return null;

  const valid = (TZ_ADDR_RE.test(to) || EVM_ADDR_RE.test(to)) && /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;

  const submit = async () => {
    setStage('sending');
    setErr(null);
    try {
      const hash = await sendPopupRequest<string>({
        type:   'SEND_TX',
        to,
        amount: xtzToHexWei(amount),
        asset,
      });
      setHash(hash);
      setStage('done');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setStage('review');
    }
  };

  const back = () => {
    if (stage === 'form')   navigate(-1);
    if (stage === 'review') setStage('form');
  };

  if (stage === 'sending') {
    return (
      <div className="tx-page">
        <TopBar title="" />
        <div className="tx-page-scroll" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 20 }}>
          <div className="tx-sending" />
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Broadcasting…</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {parseFloat(amount || '0').toLocaleString()} {asset} · {asset === 'XTZ' ? 'Tezos L1' : 'Etherlink L2'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="tx-page">
        <TopBar title="" />
        <div className="tx-page-scroll" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <div style={{ flex: 1 }} />
          <div className="tx-success-burst">
            <Icon name="check" size={32} color="var(--tx-success)" strokeWidth={2.25} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Sent</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {parseFloat(amount || '0').toLocaleString()} {asset} to {truncAddr(to, 6)}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {txHash && (
            <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', letterSpacing: '0.02em' }}>
              Hash <span className="tx-mono" style={{ color: 'var(--tx-fg-muted)' }}>{truncAddr(txHash, 5)}</span>
            </div>
          )}
        </div>
        <div className="tx-action-bar">
          <Button variant="accent" full onClick={() => navigate('/')}>Done</Button>
        </div>
      </div>
    );
  }

  if (stage === 'review') {
    return (
      <div className="tx-page">
        <TopBar title="Review transfer" onBack={back} />
        <div className="tx-page-scroll" style={{ padding: 16 }}>
          <div className="tx-lane" style={{ marginBottom: 16 }}>
            <div className="tx-lane-side">
              <span className="k">From</span>
              <span className="v">{truncAddr(asset === 'XTZ' ? state.tz1 : state.evmAlias, 6)}</span>
              <ChainPill chain={asset === 'XTZ' ? 'l1' : 'l2'} />
            </div>
            <span className="tx-lane-arrow"><Icon name="arrow-right" size={14} /></span>
            <div className="tx-lane-side">
              <span className="k">To</span>
              <span className="v">{truncAddr(to, 6)}</span>
              <ChainPill chain={asset === 'XTZ' ? 'l1' : 'l2'} />
            </div>
          </div>

          <div className="tx-card" style={{ padding: 0 }}>
            <Line label="Amount" value={`${parseFloat(amount).toLocaleString()} ${asset}`} />
            <div className="tx-divider" />
            <Line label="Network" value="Tezos X Testnet · via NAC" />
          </div>

          {error != null && (
            <p style={{ fontSize: 12, color: 'var(--tx-danger)', marginTop: 12 }}>{error}</p>
          )}

          <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', padding: '12px 4px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="info" size={14} color="var(--tx-fg-subtle)" />
            <span>Make sure the recipient is correct — transfers can't be reversed.</span>
          </div>
        </div>
        <div className="tx-action-bar" style={{ gap: 8 }}>
          <Button variant="outline" onClick={back}>Cancel</Button>
          <Button variant="accent" full onClick={submit}>Confirm & send</Button>
        </div>
      </div>
    );
  }

  // form
  return (
    <div className="tx-page">
      <TopBar title="Send" onBack={back} />
      <div className="tx-page-scroll" style={{ padding: '4px 16px 16px' }}>
        <div className="tx-kicker" style={{ padding: '8px 0' }}>Asset</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
          <button
            className={`tx-btn ${asset === 'XTZ' ? 'outline' : 'ghost'}`}
            onClick={() => setAsset('XTZ')}
            style={{
              height: 56,
              justifyContent: 'flex-start',
              padding: '0 12px',
              boxShadow: asset === 'XTZ' ? 'inset 0 0 0 1px var(--tx-purple)' : undefined,
            }}
          >
            <AssetMark asset="xtz" size="sm" />
            <div style={{ textAlign: 'left', marginLeft: 4 }}>
              <div style={{ fontSize: 13 }}>XTZ</div>
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', fontWeight: 400 }}>Tezos L1</div>
            </div>
          </button>
          <button
            className={`tx-btn ${asset === 'USDC' ? 'outline' : 'ghost'}`}
            onClick={() => setAsset('USDC')}
            style={{
              height: 56,
              justifyContent: 'flex-start',
              padding: '0 12px',
              boxShadow: asset === 'USDC' ? 'inset 0 0 0 1px var(--tx-cyan)' : undefined,
            }}
          >
            <AssetMark asset="usdc" size="sm" />
            <div style={{ textAlign: 'left', marginLeft: 4 }}>
              <div style={{ fontSize: 13 }}>USDC</div>
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', fontWeight: 400 }}>Etherlink L2</div>
            </div>
          </button>
        </div>

        <div className="tx-kicker" style={{ padding: '0 0 8px' }}>Recipient</div>
        <input
          className="tx-input mono"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={asset === 'XTZ' ? 'tz1… or tz2…' : '0x…'}
        />
        <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChainPill chain={asset === 'XTZ' ? 'l1' : 'l2'} />
          <span>Sending on {asset === 'XTZ' ? 'Tezos L1' : 'Etherlink L2'}</span>
        </div>

        <div className="tx-kicker" style={{ padding: '18px 0 8px' }}>Amount</div>
        <div className="tx-card flat" style={{ padding: 16 }}>
          <input
            className="tx-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
          />
        </div>

        {error != null && (
          <p style={{ fontSize: 12, color: 'var(--tx-danger)', marginTop: 12 }}>{error}</p>
        )}
      </div>
      <div className="tx-action-bar">
        <Button variant="accent" full disabled={!valid} onClick={() => setStage('review')}>
          Review
        </Button>
      </div>
    </div>
  );
}
