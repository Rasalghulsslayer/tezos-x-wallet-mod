import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResolveTxResult, SendTxResult, VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { detectRuntime, type DestRuntime } from '@/lib/address';
import { EVM_EXPLORER, TEZOS_EXPLORER } from '@/lib/constants';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { AssetMark } from '../tx/AssetMark';
import { ChainPill } from '../tx/ChainPill';
import { Line } from '../tx/Line';
import { RoutingCard } from '../tx/RoutingCard';
import { truncAddr } from '../tx/utils';

type Stage = 'form' | 'review' | 'sending' | 'resolving' | 'done';
type Asset = 'XTZ' | 'USDC';

interface DoneState {
  /** Hash to display + linkify on the explorer for `runtime`. */
  hash:    string;
  runtime: 'l1' | 'l2';
  /** True when we couldn't resolve the real EVM hash and we fell back
   *  to showing the underlying L1 op hash with a "pending" hint. */
  pending: boolean;
}

const RESOLVE_POLL_MS    = 2_000;
const RESOLVE_TIMEOUT_MS = 60_000;

function xtzToHexWei(xtz: string): string {
  const [whole, frac = ''] = xtz.trim().split('.');
  const padded = (whole + frac.padEnd(18, '0')).slice(0, whole.length + 18);
  const big = BigInt(padded);
  return '0x' + big.toString(16);
}

function routingLabel(dest: DestRuntime): string {
  if (dest === 'l1') return 'Same-runtime · Tezos L1';
  if (dest === 'l2') return 'Cross-runtime · L1 → L2 via NAC gateway';
  return '—';
}

function settlingSuffix(dest: DestRuntime): string {
  if (dest === 'l2') return 'via NAC gateway';
  if (dest === 'l1') return 'on Tezos L1';
  return '';
}

export function Send({ state, onDone }: { state: VaultState; onDone: () => void }) {
  const navigate = useNavigate();
  const [asset,  setAsset] = useState<Asset>('XTZ');
  const [to,     setTo]    = useState('');
  const [amount, setAmt]   = useState('');
  const [stage,  setStage] = useState<Stage>('form');
  const [error,  setErr]   = useState<string | null>(null);
  const [done,   setDone]  = useState<DoneState | null>(null);
  /** Synthetic hash returned by the SW, used to poll RESOLVE_TX. */
  const [pendingResolve, setPendingResolve] = useState<{ syntheticHash: string } | null>(null);

  // Poll the SW for the real EVM hash while in the "resolving" stage.
  useEffect(() => {
    if (stage !== 'resolving' || pendingResolve == null) return;

    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const result = await sendPopupRequest<ResolveTxResult>({
          type: 'RESOLVE_TX',
          syntheticHash: pendingResolve.syntheticHash,
        });
        if (cancelled) return;
        if (result.resolved) {
          setDone({ hash: result.hash, runtime: 'l2', pending: false });
          setPendingResolve(null);
          setStage('done');
          onDone();
          return;
        }
      } catch {
        /* keep polling — transient SW error */
      }

      if (Date.now() - startedAt >= RESOLVE_TIMEOUT_MS) {
        // Give up; fall back to the L1 op hash via the explorer.
        setDone({ hash: pendingResolve.syntheticHash, runtime: 'l2', pending: true });
        setPendingResolve(null);
        setStage('done');
        onDone();
        return;
      }

      setTimeout(tick, RESOLVE_POLL_MS);
    };

    setTimeout(tick, RESOLVE_POLL_MS);
    return () => { cancelled = true; };
  }, [stage, pendingResolve, onDone]);

  if (state.status !== 'unlocked') return null;

  const dest    = detectRuntime(to);
  const isCross = dest === 'l2';

  const usdcOnL1 = asset === 'USDC' && dest === 'l1';
  const valid =
    dest !== null &&
    !usdcOnL1 &&
    /^\d+(\.\d+)?$/.test(amount) &&
    Number(amount) > 0;

  const submit = async () => {
    setStage('sending');
    setErr(null);
    try {
      const result = await sendPopupRequest<SendTxResult>({
        type:   'SEND_TX',
        to,
        amount: xtzToHexWei(amount),
        asset,
      });

      if (result.runtime === 'l1') {
        setDone({ hash: result.hash, runtime: 'l1', pending: false });
        setStage('done');
        onDone();
        return;
      }

      // Cross-runtime: wait for the real EVM hash before showing "Done".
      setPendingResolve({ syntheticHash: result.hash });
      setStage('resolving');
    } catch (e) {
      setErr((e as Error).message);
      setStage('review');
    }
  };

  const back = () => {
    if (stage === 'form')   navigate(-1);
    if (stage === 'review') setStage('form');
  };

  const explorerUrl = (d: DoneState): string =>
    d.runtime === 'l1'
      ? `${TEZOS_EXPLORER}/${d.hash}`
      : d.pending
        ? `${TEZOS_EXPLORER}/${d.hash}`           // L1 op hash fallback
        : `${EVM_EXPLORER}/tx/${d.hash}`;

  // ── Sending stage ────────────────────────────────────────────────────────
  if (stage === 'sending') {
    return (
      <div className="tx-page">
        <TopBar title="" />
        <div className="tx-page-scroll" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 20 }}>
          <div className="tx-sending" />
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Broadcasting…</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {parseFloat(amount || '0').toLocaleString()} {asset} · {settlingSuffix(dest)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Resolving stage (cross-runtime: waiting for the real EVM hash) ──────
  if (stage === 'resolving') {
    return (
      <div className="tx-page">
        <TopBar title="" />
        <div className="tx-page-scroll" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 20 }}>
          <div className="tx-sending" />
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Confirming on Tezos L2…</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6 }}>
              L1 op signed. Waiting for the kernel-synthesized EVM transaction.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Done stage ───────────────────────────────────────────────────────────
  if (stage === 'done' && done != null) {
    return (
      <div className="tx-page">
        <TopBar title="" />
        <div className="tx-page-scroll" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <div style={{ flex: 1 }} />
          <div className="tx-success-burst">
            <Icon name="check" size={32} color="var(--tx-success)" strokeWidth={2.25} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>
              {done.pending ? 'Submitted' : 'Sent'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              {parseFloat(amount || '0').toLocaleString()} {asset} to {truncAddr(to, 6)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', marginTop: 4 }}>
              {settlingSuffix(dest)}
            </div>
          </div>
          <div style={{ flex: 1 }} />

          {done.pending && (
            <div style={{ fontSize: 11, color: 'var(--tx-warning)', maxWidth: 280 }}>
              The L1 op is confirmed but the kernel-synthesized EVM hash didn't resolve in time. Open the L1 operation on tzkt to track it.
            </div>
          )}

          <a
            href={explorerUrl(done)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: 'var(--tx-fg-muted)',
              letterSpacing: '0.02em',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>Hash</span>
            <span className="tx-mono" style={{ color: 'var(--tx-fg)' }}>{truncAddr(done.hash, 5)}</span>
            <Icon name="arrow-up-right" size={11} />
          </a>
        </div>
        <div className="tx-action-bar">
          <Button variant="accent" full onClick={() => navigate('/')}>Done</Button>
        </div>
      </div>
    );
  }

  // ── Review stage ─────────────────────────────────────────────────────────
  if (stage === 'review') {
    return (
      <div className="tx-page">
        <TopBar title="Review transfer" onBack={back} />
        <div className="tx-page-scroll" style={{ padding: 16 }}>
          <div className="tx-lane" style={{ marginBottom: 16 }}>
            <div className="tx-lane-side">
              <span className="k">From</span>
              <span className="v">{truncAddr(state.tz1, 6)}</span>
              <ChainPill chain="l1" />
            </div>
            <span
              className="tx-lane-arrow"
              title={isCross ? 'via NAC gateway' : 'native L1 transfer'}
              style={isCross ? { background: 'linear-gradient(90deg, var(--tx-purple), var(--tx-cyan))', color: '#fff' } : undefined}
            >
              <Icon name="arrow-right" size={14} />
            </span>
            <div className="tx-lane-side">
              <span className="k">To</span>
              <span className="v">{truncAddr(to, 6)}</span>
              <ChainPill chain={dest === 'l2' ? 'l2' : 'l1'} />
            </div>
          </div>

          <div className="tx-card" style={{ padding: 0 }}>
            <Line label="Amount" value={`${parseFloat(amount).toLocaleString()} ${asset}`} />
            <div className="tx-divider" />
            <Line label="Routing" value={routingLabel(dest)} />
            <div className="tx-divider" />
            <Line label="Network" value="Tezos X Previewnet" />
          </div>

          {error != null && (
            <p style={{ fontSize: 12, color: 'var(--tx-danger)', marginTop: 12 }}>{error}</p>
          )}

          <div style={{ fontSize: 11, color: 'var(--tx-fg-subtle)', padding: '12px 4px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="info" size={14} color="var(--tx-fg-subtle)" />
            <span>
              {isCross
                ? 'Your tz1 signs an L1 op routed to the EVM runtime through the NAC gateway. The receiving 0x address is credited atomically.'
                : 'Make sure the recipient is correct — transfers can\'t be reversed.'}
            </span>
          </div>
        </div>
        <div className="tx-action-bar" style={{ gap: 8 }}>
          <Button variant="outline" onClick={back}>Cancel</Button>
          <Button variant="accent" full onClick={submit}>Confirm & send</Button>
        </div>
      </div>
    );
  }

  // ── Form stage ───────────────────────────────────────────────────────────
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
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', fontWeight: 400 }}>Native asset</div>
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
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', fontWeight: 400 }}>Tezos L2 · ERC-20</div>
            </div>
          </button>
        </div>

        <div className="tx-kicker" style={{ padding: '0 0 8px' }}>Recipient</div>
        <input
          className="tx-input mono"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={asset === 'USDC' ? '0x…' : 'tz1… or 0x…'}
        />
        <RoutingCard asset={asset} dest={dest} />

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
