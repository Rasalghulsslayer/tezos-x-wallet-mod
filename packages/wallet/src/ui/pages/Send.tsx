import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResolveTxResult, SendTxResult, VaultState } from '@/lib/messages';
import { sendPopupRequest } from '@/lib/messaging';
import { detectRuntime, type DestRuntime } from '@/lib/address';
import { USDC_CONTRACT } from '@/lib/constants';
import { fetchL1XtzBalance, fetchErc20Balance } from '@/lib/balances';
import { mutezToXtz, formatUsdc } from '@/lib/format';
import { formatError } from '@/lib/errors';
import { trackTx, type TxStatus } from '@/lib/tx-status';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { AssetMark } from '../tx/AssetMark';
import { ChainPill } from '../tx/ChainPill';
import { Line } from '../tx/Line';
import { RoutingCard } from '../tx/RoutingCard';
import { AvailableRow } from '../tx/AvailableRow';
import { InsufficientWarning } from '../tx/InsufficientWarning';
import { ErrorCard } from '../tx/ErrorCard';
import { StatusTimeline } from '../tx/StatusTimeline';
import { StatusHero } from '../tx/StatusHero';
import { StatusMeta } from '../tx/StatusMeta';
import { TEZOS_EXPLORER, EVM_EXPLORER } from '@/lib/constants';
import { truncAddr } from '../tx/utils';

type Stage = 'form' | 'review' | 'done';
type Asset = 'XTZ' | 'USDC';

interface DoneState {
  /** Hash to display + linkify on the explorer for `runtime`. */
  hash:    string;
  runtime: 'l1' | 'l2';
  /** True when we couldn't resolve the real EVM hash and we fell back
   *  to showing the underlying L1 op hash with a "pending" hint. */
  pending: boolean;
}

interface Balances {
  /** Native XTZ on the Michelson runtime, formatted decimal string. */
  xtz:  string;
  /** USDC ERC-20 on the EVM runtime, formatted decimal string. */
  usdc: string;
  loading: boolean;
}

const RESOLVE_POLL_MS    = 2_000;
const RESOLVE_TIMEOUT_MS = 60_000;
/** Fee margin reserved when the user clicks Max on XTZ (mutez). */
const MAX_FEE_RESERVE_MUTEZ = 10_000n; // 0.01 XTZ

function xtzToHexWei(xtz: string): string {
  const [whole, frac = ''] = xtz.trim().split('.');
  const padded = (whole + frac.padEnd(18, '0')).slice(0, whole.length + 18);
  const big = BigInt(padded);
  return '0x' + big.toString(16);
}

/** Decimal XTZ string → mutez bigint (6 decimals). */
function mutezToBig(xtz: string): bigint {
  const [whole, frac = ''] = xtz.trim().split('.');
  const mutezPart = (whole + frac.padEnd(6, '0')).slice(0, whole.length + 6);
  return BigInt(mutezPart || '0');
}

/** mutez bigint → decimal XTZ string with trailing zeros trimmed. */
function bigMutezToXtzString(mutez: bigint): string {
  const whole = mutez / 1_000_000n;
  const frac  = mutez % 1_000_000n;
  return frac === 0n
    ? whole.toString()
    : `${whole.toString()}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

function routingLabel(dest: DestRuntime): string {
  if (dest === 'l1') return 'Same-runtime';
  if (dest === 'l2') return 'Cross-runtime · L1 → L2 via NAC gateway';
  return '—';
}

export function Send({ state, onDone }: { state: VaultState; onDone: () => void }) {
  const navigate = useNavigate();
  const [asset,  setAsset] = useState<Asset>('XTZ');
  const [to,     setTo]    = useState('');
  const [amount, setAmt]   = useState('');
  const [stage,  setStage] = useState<Stage>('form');
  const [error,  setErr]   = useState<string | null>(null);
  const [done,   setDone]  = useState<DoneState | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  /** Wall-clock origin used by the timeline's "X s ago" sub. Set when we
   *  enter the `done` stage so the counter survives status updates. */
  const [doneStartedAt, setDoneStartedAt] = useState<number | null>(null);
  /** Synthetic hash returned by the SW, used to poll RESOLVE_TX. */
  const [pendingResolve, setPendingResolve] = useState<{ syntheticHash: string } | null>(null);
  const [balances, setBalances] = useState<Balances>({ xtz: '0', usdc: '0', loading: true });

  // Fetch balances on mount + on unlocked-state change. Same pattern as Home.
  const tz1      = state.status === 'unlocked' ? state.tz1      : '';
  const evmAlias = state.status === 'unlocked' ? state.evmAlias : '';
  useEffect(() => {
    if (tz1 === '' || evmAlias === '') return;
    let cancelled = false;
    (async () => {
      try {
        const [xtzMutez, usdcHex] = await Promise.all([
          fetchL1XtzBalance(tz1),
          fetchErc20Balance(USDC_CONTRACT, evmAlias),
        ]);
        if (cancelled) return;
        setBalances({ xtz: mutezToXtz(xtzMutez), usdc: formatUsdc(usdcHex), loading: false });
      } catch {
        if (!cancelled) setBalances((b) => ({ ...b, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [tz1, evmAlias]);

  useEffect(() => {
    if (pendingResolve == null) return;

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
          setDone((prev) => prev != null ? { ...prev, hash: result.hash, pending: false } : prev);
          setPendingResolve(null);
          onDone();
          return;
        }
      } catch {
        /* keep polling — transient SW error */
      }

      if (Date.now() - startedAt >= RESOLVE_TIMEOUT_MS) {
        // Give up; trackTx will eventually time out on the synthetic hash and
        // surface "Status unavailable" with a manual explorer link.
        setDone((prev) => prev != null ? { ...prev, pending: true } : prev);
        setPendingResolve(null);
        onDone();
        return;
      }

      setTimeout(() => { void tick(); }, RESOLVE_POLL_MS);
    };

    setTimeout(() => { void tick(); }, RESOLVE_POLL_MS);
    return () => { cancelled = true; };
  }, [pendingResolve, onDone]);

  useEffect(() => {
    if (stage !== 'done' || done == null || done.hash === '') return;
    const handle = trackTx({
      hash:     done.hash,
      runtime:  done.runtime,
      onUpdate: setTxStatus,
    });
    return () => handle.stop();
  }, [stage, done]);

  if (state.status !== 'unlocked') return null;

  const dest    = detectRuntime(to);
  const isCross = dest === 'l2';

  const usdcOnL1 = asset === 'USDC' && dest === 'l1';
  const valid =
    dest !== null &&
    !usdcOnL1 &&
    /^\d+(\.\d+)?$/.test(amount) &&
    Number(amount) > 0;

  const availableStr = asset === 'XTZ' ? balances.xtz : balances.usdc;
  const insufficient = !balances.loading
    && parseFloat(amount || '0') > 0
    && parseFloat(amount || '0') > parseFloat(availableStr);

  const handleMax = () => {
    if (balances.loading) return;
    if (asset === 'XTZ') {
      // Reserve a small fee margin so the user doesn't tap below the kernel cost.
      const mutezTotal = mutezToBig(balances.xtz);
      const usable     = mutezTotal > MAX_FEE_RESERVE_MUTEZ
        ? mutezTotal - MAX_FEE_RESERVE_MUTEZ
        : 0n;
      setAmt(bigMutezToXtzString(usable));
    } else {
      setAmt(balances.usdc);
    }
  };

  const submit = async () => {
    setErr(null);
    setTxStatus(null);
    const predictedRuntime: 'l1' | 'l2' = (asset === 'XTZ' && dest === 'l1') ? 'l1' : 'l2';
    setDone({ hash: '', runtime: predictedRuntime, pending: false });
    setDoneStartedAt(Date.now());
    setStage('done');
    try {
      const result = await sendPopupRequest<SendTxResult>({
        type:   'SEND_TX',
        to,
        amount: xtzToHexWei(amount),
        asset,
      });

      if (result.runtime === 'l1') {
        setDone({ hash: result.hash, runtime: 'l1', pending: false });
        onDone();
        return;
      }

      // Cross-runtime: surface the synthetic hash now; the resolve effect
      // will swap in the real EVM hash once the kernel mints it.
      setDone({ hash: result.hash, runtime: 'l2', pending: true });
      setPendingResolve({ syntheticHash: result.hash });
    } catch (e) {
      setErr((e as Error).message);
      setDone(null);
      setDoneStartedAt(null);
      setStage('review');
    }
  };

  const back = () => {
    if (stage === 'form')   navigate(-1);
    if (stage === 'review') setStage('form');
  };

  // ── Done stage ───────────────────────────────────────────────────────────
  if (stage === 'done' && done != null && doneStartedAt != null) {
    const isFinalized   = txStatus?.stage === 'finalized';
    const isFailed      = txStatus?.stage === 'failed' || txStatus?.stage === 'unavailable';
    const explorerUrl   = done.runtime === 'l1'
      ? `${TEZOS_EXPLORER}/${done.hash}`
      : `${EVM_EXPLORER}/tx/${done.hash}`;
    const explorerName  = done.runtime === 'l1' ? 'tzkt' : 'blockscout';
    const status        = txStatus ?? { stage: 'broadcasting' as const };

    return (
      <div className="tx-page">
        <TopBar title="" />
        <div className="tx-page-scroll" style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <StatusHero
            status={status}
            runtime={done.runtime}
            amount={parseFloat(amount || '0').toString()}
            asset={asset}
            to={truncAddr(to, 6)}
          />
          <StatusTimeline status={status} runtime={done.runtime} startedAt={doneStartedAt} />
          {!isFailed && done.hash !== '' && <StatusMeta status={status} runtime={done.runtime} hash={done.hash} />}
          {isFailed && (
            <div className="tx-status-fail" role="alert">
              <span className="tx-status-fail-ico" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 4.75v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                </svg>
              </span>
              <div>
                <div className="tx-status-fail-title">
                  {txStatus?.stage === 'failed' ? 'Transaction failed' : 'Status unavailable'}
                </div>
                <div className="tx-status-fail-detail">
                  {txStatus?.stage === 'failed'
                    ? `The op was rejected on-chain (${txStatus.reason}).`
                    : "The RPC didn't reply. Your op was broadcast — check the explorer to see if it landed."}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="tx-action-bar">
          {isFailed
            ? <Button variant="outline" full onClick={() => window.open(explorerUrl, '_blank')}>View on {explorerName} →</Button>
            : <Button variant={isFinalized ? 'accent' : 'outline'} full onClick={() => navigate('/')}>Done</Button>
          }
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

          {error != null
            ? <ErrorCard error={formatError(error)} />
            : insufficient && (
                <InsufficientWarning
                  requested={parseFloat(amount).toString()}
                  available={availableStr}
                  asset={asset}
                />
              )
          }

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
              <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', fontWeight: 400 }}>ERC-20 · EVM runtime</div>
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
          <AvailableRow
            available={availableStr}
            asset={asset}
            insufficient={insufficient}
            loading={balances.loading}
            onMax={handleMax}
          />
        </div>

        {error != null && <ErrorCard error={formatError(error)} />}
      </div>
      <div className="tx-action-bar">
        <Button variant="accent" full disabled={!valid} onClick={() => setStage('review')}>
          Review
        </Button>
      </div>
    </div>
  );
}
