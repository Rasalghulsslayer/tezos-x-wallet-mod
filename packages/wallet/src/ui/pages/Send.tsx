import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResolveTxResult, SendTxResult, VaultState, VaultStateUnlocked } from '@/shared/messages';
import { sendPopupRequest } from '@/shared/messaging';
import { detectRuntime } from '@/domain/validation';
import type { DestRuntime } from '@/domain/chain';
import { USDC_CONTRACT } from '@/shared/constants';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@/adapters/tezos/tezos-balance-fetcher';
import { mutezToXtz, weiToXtz, formatUsdc } from '@/shared/format';
import { formatError } from '@/domain/error';
import { trackTx } from '@/shared/tx-status';
import type { TxStatus } from '@/domain/tx-status';
import { signingSourceAddress } from '../view-models/account-card-vm';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { AssetSelector, type AssetOption } from '../tx/AssetSelector';
import { XTZ_L1_ASSET, XTZ_L2_ASSET, USDC_ASSET } from '@/domain/asset';
import { ChainPill } from '../tx/ChainPill';
import { Line } from '../tx/Line';
import { RoutingCard } from '../tx/RoutingCard';
import { AvailableRow } from '../tx/AvailableRow';
import { InsufficientWarning } from '../tx/InsufficientWarning';
import { ErrorCard } from '../tx/ErrorCard';
import { StatusTimeline } from '../tx/StatusTimeline';
import { StatusHero } from '../tx/StatusHero';
import { StatusMeta } from '../tx/StatusMeta';
import { TEZOS_EXPLORER, EVM_EXPLORER } from '@/shared/constants';
import { truncAddr } from '../tx/utils';

type Stage = 'form' | 'review' | 'done';
type Asset = 'XTZ' | 'USDC';

interface DoneState {
  hash:    string;
  runtime: 'l1' | 'l2';
  pending: boolean;
}

interface Balances {
  xtz:  string;
  usdc: string;
  loading: boolean;
}

const RESOLVE_POLL_MS    = 2_000;
const RESOLVE_TIMEOUT_MS = 60_000;
const MAX_FEE_RESERVE_MUTEZ = 10_000n;

function xtzToHexWei(xtz: string): string {
  const [whole, frac = ''] = xtz.trim().split('.');
  const padded = (whole + frac.padEnd(18, '0')).slice(0, whole.length + 18);
  const big = BigInt(padded);
  return '0x' + big.toString(16);
}

function mutezToBig(xtz: string): bigint {
  const [whole, frac = ''] = xtz.trim().split('.');
  const mutezPart = (whole + frac.padEnd(6, '0')).slice(0, whole.length + 6);
  return BigInt(mutezPart || '0');
}

function bigMutezToXtzString(mutez: bigint): string {
  const whole = mutez / 1_000_000n;
  const frac  = mutez % 1_000_000n;
  return frac === 0n
    ? whole.toString()
    : `${whole.toString()}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

function routingLabel(sourceKind: 'tezos' | 'evm', dest: DestRuntime): string {
  if (dest == null) return '—';
  if (sourceKind === 'tezos') {
    return dest === 'l1'
      ? 'Same-runtime · Tezos L1'
      : 'Cross-runtime · L1 → L2 via NAC gateway';
  }
  return dest === 'l2'
    ? 'Same-runtime · Tezos L2 (EVM)'
    : 'Cross-runtime · L2 → L1 via NAC precompile';
}

export function Send({ state, onDone }: { state: VaultState; onDone: () => void }) {
  if (state.status !== 'unlocked') return null;
  return <SendUnlocked state={state} onDone={onDone} />;
}

function SendUnlocked({ state, onDone }: { state: VaultStateUnlocked; onDone: () => void }) {
  const navigate = useNavigate();
  const isEvmSource = state.kind === 'evm';
  // EVM-source XTZ-only in 0.7.0; USDC source-from-EVM is out of scope.
  const [asset,  setAsset] = useState<Asset>('XTZ');
  const [to,     setTo]    = useState('');
  const [amount, setAmt]   = useState('');
  const [stage,  setStage] = useState<Stage>('form');
  const [error,  setErr]   = useState<string | null>(null);
  const [done,   setDone]  = useState<DoneState | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [doneStartedAt, setDoneStartedAt] = useState<number | null>(null);
  const [pendingResolve, setPendingResolve] = useState<{ syntheticHash: string } | null>(null);
  const [balances, setBalances] = useState<Balances>({ xtz: '0', usdc: '0', loading: true });

  // Kind-dependent address resolution and balance source.
  const fromAddr  = signingSourceAddress(state);
  const usdcAddr  = state.kind === 'tezos' ? state.evmAlias : state.address;

  useEffect(() => {
    if (fromAddr === '') return;
    let cancelled = false;
    (async () => {
      try {
        const xtzPromise = state.kind === 'tezos'
          ? fetchL1XtzBalance(state.tz1).then(mutezToXtz)
          : fetchXtzBalance(state.address).then(weiToXtz);
        // Skip the USDC fetch entirely for EVM-source: USDC isn't a selectable
        // asset in this branch, so the value is never read.
        const usdcPromise = state.kind === 'tezos'
          ? fetchErc20Balance(USDC_CONTRACT, state.evmAlias).then(formatUsdc)
          : Promise.resolve('0');

        const [xtzStr, usdcStr] = await Promise.all([xtzPromise, usdcPromise]);
        if (cancelled) return;
        setBalances({ xtz: xtzStr, usdc: usdcStr, loading: false });
      } catch {
        if (!cancelled) setBalances((b) => ({ ...b, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [fromAddr, usdcAddr, state.kind]);

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
      } catch { /* keep polling */ }

      if (Date.now() - startedAt >= RESOLVE_TIMEOUT_MS) {
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

  const dest    = detectRuntime(to);
  const isCross = state.kind === 'tezos' ? dest === 'l2' : dest === 'l1';

  const usdcOnL1 = asset === 'USDC' && dest === 'l1';
  const valid =
    dest !== null &&
    !usdcOnL1 &&
    (!isEvmSource || asset === 'XTZ') &&
    /^\d+(\.\d+)?$/.test(amount) &&
    Number(amount) > 0;

  const availableStr = asset === 'XTZ' ? balances.xtz : balances.usdc;
  const insufficient = !balances.loading
    && parseFloat(amount || '0') > 0
    && parseFloat(amount || '0') > parseFloat(availableStr);

  const handleMax = () => {
    if (balances.loading) return;
    if (asset === 'XTZ') {
      const mutezTotal = mutezToBig(balances.xtz);
      const usable     = mutezTotal > MAX_FEE_RESERVE_MUTEZ
        ? mutezTotal - MAX_FEE_RESERVE_MUTEZ
        : 0n;
      setAmt(bigMutezToXtzString(usable));
    } else {
      setAmt(balances.usdc);
    }
  };

  // Predict the runtime the user will track on the explorer:
  //   tz1 → tz1: L1; everything else routes through L2 (NAC gateway L1→L2
  //   resolves to an EVM hash; EVM-source always broadcasts on L2 even when
  //   the destination is L1).
  const predictedRuntime: 'l1' | 'l2' =
    state.kind === 'tezos' && asset === 'XTZ' && dest === 'l1' ? 'l1' : 'l2';

  const submit = async () => {
    setErr(null);
    setTxStatus(null);
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

      // L2 — for tz1→0x via NAC gateway we get a synthetic hash; for
      // EVM-source the hash is already the real EVM hash and resolution
      // is a no-op. Try resolving regardless; the SW's EvmProvider returns
      // null for real EVM hashes, which falls through to the timeout
      // branch within RESOLVE_TIMEOUT_MS without harm.
      const fromGateway = state.kind === 'tezos' && dest === 'l2';
      setDone({ hash: result.hash, runtime: 'l2', pending: fromGateway });
      if (fromGateway) {
        setPendingResolve({ syntheticHash: result.hash });
      } else {
        onDone();
      }
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
    const fromChain: 'l1' | 'l2' = state.kind === 'tezos' ? 'l1' : 'l2';
    const destChain: 'l1' | 'l2' = dest === 'l2' ? 'l2' : 'l1';
    const reviewCopy = state.kind === 'tezos'
      ? (isCross
          ? 'Your tz1 signs an L1 op routed to the EVM runtime through the NAC gateway. The receiving 0x address is credited atomically.'
          : 'Make sure the recipient is correct — transfers can\'t be reversed.')
      : (isCross
          ? 'Your 0x signs an EVM transaction that calls the NAC precompile. The kernel forwards the value to the receiving tz1 atomically.'
          : 'Make sure the recipient is correct — transfers can\'t be reversed.');

    return (
      <div className="tx-page">
        <TopBar title="Review transfer" onBack={back} />
        <div className="tx-page-scroll" style={{ padding: 16 }}>
          <div className="tx-lane" style={{ marginBottom: 16 }}>
            <div className="tx-lane-side">
              <span className="k">From</span>
              <span className="v">{truncAddr(fromAddr, 6)}</span>
              <ChainPill chain={fromChain} />
            </div>
            <span
              className="tx-lane-arrow"
              title={isCross ? 'cross-runtime via NAC' : 'native transfer'}
              style={isCross ? { background: 'linear-gradient(90deg, var(--tx-purple), var(--tx-cyan))', color: '#fff' } : undefined}
            >
              <Icon name="arrow-right" size={14} />
            </span>
            <div className="tx-lane-side">
              <span className="k">To</span>
              <span className="v">{truncAddr(to, 6)}</span>
              <ChainPill chain={destChain} />
            </div>
          </div>

          <div className="tx-card" style={{ padding: 0 }}>
            <Line label="Amount" value={`${parseFloat(amount).toLocaleString()} ${asset}`} />
            <div className="tx-divider" />
            <Line label="Routing" value={routingLabel(state.kind, dest)} />
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
            <span>{reviewCopy}</span>
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
        {(() => {
          const xtzAsset = state.kind === 'tezos' ? XTZ_L1_ASSET : XTZ_L2_ASSET;
          const options: AssetOption[] = [
            { asset: xtzAsset, subLabel: 'Native asset' },
            {
              asset:    USDC_ASSET,
              subLabel: isEvmSource ? 'Soon · EVM-source' : 'ERC-20 · EVM runtime',
              disabled: isEvmSource,
              title:    isEvmSource ? 'USDC sends from EVM accounts are coming in a follow-up release.' : undefined,
            },
          ];
          const selected = asset === 'XTZ' ? xtzAsset : USDC_ASSET;
          return (
            <AssetSelector
              options={options}
              selected={selected}
              onSelect={(a) => setAsset(a.kind === 'xtz' ? 'XTZ' : 'USDC')}
              onAddToken={() => navigate('/tokens/add')}
            />
          );
        })()}

        <div className="tx-kicker" style={{ padding: '0 0 8px' }}>Recipient</div>
        <input
          className="tx-input mono"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={
            isEvmSource ? '0x… or tz1…' :
            asset === 'USDC' ? '0x…' :
            'tz1… or 0x…'
          }
        />
        <RoutingCard asset={asset} dest={dest} sourceKind={state.kind} />

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
