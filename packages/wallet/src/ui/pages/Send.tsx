import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResolveTxResult, SendTxResult, VaultState, VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';
import { sendPopupRequest } from '@/shared/messaging';
import { detectRuntime } from '@tezosx/wallet-core/domain/validation';
import type { DestRuntime } from '@tezosx/wallet-core/domain/chain';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import type { Contact } from '@tezosx/wallet-core/domain/contact';
import { contactFor, matchContacts, shouldOfferSaveContact } from '@tezosx/wallet-core/view-models/contacts-vm';
import { MAX_LABEL_LENGTH } from '@tezosx/wallet-core/shared/constants';
import {
  fetchL1XtzBalance,
  fetchXtzBalance,
  fetchErc20Balance,
} from '@tezosx/wallet-core/adapters/tezos/tezos-balance-fetcher';
import { mutezToXtz, weiToXtz, formatTokenAmount } from '@tezosx/wallet-core/shared/format';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { trackTx } from '@tezosx/wallet-core/shared/tx-status';
import { startPoller } from '@tezosx/wallet-core/shared/poller';
import { e2eConfig } from '@tezosx/wallet-core/shared/e2e';
import type { TxStatus } from '@tezosx/wallet-core/domain/tx-status';
import { signingSourceAddress } from '@tezosx/wallet-core/view-models/account-card-vm';
import { useOnline } from '../hooks/use-online';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { AssetSelector, type AssetOption } from '../tx/AssetSelector';
import { XTZ_L1_ASSET, XTZ_L2_ASSET, type Asset, type Erc20Asset } from '@tezosx/wallet-core/domain/asset';
import { ChainPill } from '../tx/ChainPill';
import { Line } from '../tx/Line';
import { RoutingCard } from '../tx/RoutingCard';
import { AvailableRow } from '../tx/AvailableRow';
import { InsufficientWarning } from '../tx/InsufficientWarning';
import { ErrorCard } from '../tx/ErrorCard';
import { ErrorInline } from '../tx/ErrorInline';
import { Identicon } from '../tx/Identicon';
import { toast } from '../tx/Toast';
import { StatusTimeline } from '../tx/StatusTimeline';
import { StatusHero } from '../tx/StatusHero';
import { StatusMeta } from '../tx/StatusMeta';
import { TEZOS_EXPLORER, EVM_EXPLORER } from '@tezosx/wallet-core/shared/constants';
import { NAC_CONTRACT } from '@tezosx/relayer/constants';
import { truncAddr } from '../tx/utils';

type Stage = 'form' | 'review' | 'done';

interface DoneState {
  hash:    string;
  runtime: 'l1' | 'l2';
  pending: boolean;
}

/** Balance map keyed by 'xtz' for native, lowercased contract address for ERC-20. */
type BalanceMap = Record<string, string>;

function assetKey(asset: Asset): string {
  return asset.kind === 'xtz' ? 'xtz' : asset.address.toLowerCase();
}

function tokenToAsset(t: RegisteredToken): Erc20Asset {
  return { kind: 'erc20', address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals, runtime: 'evm' };
}

const RESOLVE_POLL_MS    = 2_000;
const RESOLVE_TIMEOUT_MS = 60_000;
const MAX_FEE_RESERVE_MUTEZ = 10_000n;

/**
 * Human decimal → 0x-prefixed base-units hex, scaled by `decimals`. XTZ always
 * uses 18 (the wei convention the relayer then converts ÷10^12 to mutez); an
 * ERC-20 uses its own token decimals, so the signed `transfer` amount matches
 * what the user typed rather than being over-scaled to 18.
 */
function amountToBaseUnits(human: string, decimals: number): string {
  const [whole, frac = ''] = human.trim().split('.');
  const padded = (whole + frac.padEnd(decimals, '0')).slice(0, whole.length + decimals);
  return '0x' + BigInt(padded || '0').toString(16);
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
      ? 'Same-runtime · Michelson runtime'
      : 'Cross-runtime · Michelson → EVM via NAC gateway';
  }
  return dest === 'l2'
    ? 'Same-runtime · Tezos X (EVM)'
    : 'Cross-runtime · EVM → Michelson via NAC precompile';
}

export function Send({ state, onDone }: { state: VaultState; onDone: () => void }) {
  if (state.status !== 'unlocked') return null;
  return <SendUnlocked state={state} onDone={onDone} />;
}

function SendUnlocked({ state, onDone }: { state: VaultStateUnlocked; onDone: () => void }) {
  const navigate    = useNavigate();
  const isEvmSource = state.kind === 'evm';
  const xtzAsset    = state.kind === 'tezos' ? XTZ_L1_ASSET : XTZ_L2_ASSET;
  // EVM-source ERC-20 sends are out of scope in 0.7.0+; the UI disables them.
  const [asset,  setAsset] = useState<Asset>(xtzAsset);
  const [to,     setTo]    = useState('');
  const [amount, setAmt]   = useState('');
  const [stage,  setStage] = useState<Stage>('form');
  const [error,  setErr]   = useState<string | null>(null);
  const [done,   setDone]  = useState<DoneState | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [doneStartedAt, setDoneStartedAt] = useState<number | null>(null);
  const [pendingResolve, setPendingResolve] = useState<{ syntheticHash: string } | null>(null);
  const [tokens,   setTokens]   = useState<RegisteredToken[]>([]);
  const [balances, setBalances] = useState<BalanceMap>({});
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [contacts,  setContacts]  = useState<Contact[]>([]);
  const [toFocused, setToFocused] = useState(false);
  // Post-send "Save as contact" offer state.
  const [saveName,  setSaveName]  = useState('');
  const [saveErr,   setSaveErr]   = useState<unknown>(null);
  const [saveBusy,  setSaveBusy]  = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  // Hint-gate only: navigator.onLine === false is a certain "no network route",
  // so confirming would only burn the user's time. The real failure path (RPC
  // unreachable while the flag says online) stays as is.
  const online = useOnline();

  // Kind-dependent address resolution for ERC-20 balance reads. The alias is
  // only a balance-read holder here — a tz1 → 0x send signs against the NAC
  // gateway without needing the sender's own alias — so a still-resolving
  // alias (null) just skips the ERC-20 reads until a state re-poll delivers it.
  const fromAddr = signingSourceAddress(state);
  const evmAddr  = state.kind === 'tezos' ? state.evmAlias : state.address;

  useEffect(() => {
    void sendPopupRequest<Contact[]>({ type: 'LIST_CONTACTS' }).then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    if (fromAddr === '') return;
    let cancelled = false;
    (async () => {
      try {
        const registered = await sendPopupRequest<RegisteredToken[]>({ type: 'LIST_REGISTERED_TOKENS' }).catch(() => [] as RegisteredToken[]);
        if (cancelled) return;
        setTokens(registered);

        const xtzPromise = state.kind === 'tezos'
          ? fetchL1XtzBalance(state.tz1).then(mutezToXtz)
          : fetchXtzBalance(state.address).then(weiToXtz);

        const tokenPromises = evmAddr == null ? [] : registered.map((t) =>
          fetchErc20Balance(t.address, evmAddr).then((hex) => [t.address.toLowerCase(), formatTokenAmount(hex, t.decimals)] as const),
        );

        const [xtzRes, ...tokenRes] = await Promise.allSettled([xtzPromise, ...tokenPromises]);
        if (cancelled) return;
        const map: BalanceMap = {};
        map.xtz = xtzRes.status === 'fulfilled' ? xtzRes.value : '0';
        for (const r of tokenRes) {
          if (r.status === 'fulfilled') map[r.value[0]] = r.value[1];
        }
        setBalances(map);
        setBalancesLoading(false);
      } catch {
        if (!cancelled) setBalancesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromAddr, evmAddr, state.kind]);

  useEffect(() => {
    if (pendingResolve == null) return;

    const resolveTimeoutMs = e2eConfig()?.resolveTimeoutMs ?? RESOLVE_TIMEOUT_MS;
    const handle = startPoller<ResolveTxResult>({
      intervalMs: RESOLVE_POLL_MS,
      timeoutMs:  resolveTimeoutMs,
      fetch: async () => {
        const result = await sendPopupRequest<ResolveTxResult>({
          type: 'RESOLVE_TX',
          syntheticHash: pendingResolve.syntheticHash,
        });
        return result.resolved ? result : null;
      },
      isDone: (result) => result.resolved,
      onUpdate: (result) => {
        if (!result.resolved) return;
        setDone((prev) => prev != null ? { ...prev, hash: result.hash, pending: false } : prev);
        setPendingResolve(null);
        onDone();
      },
      onTimeout: () => {
        setDone((prev) => prev != null ? { ...prev, pending: true } : prev);
        setPendingResolve(null);
        onDone();
      },
    });
    return () => handle.stop();
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

  // Address-book projections: the resolved name for the typed recipient, and
  // the suggestions offered while the field has focus and resolves to nothing.
  const toContact   = contactFor(to, contacts);
  const suggestions = toFocused && toContact == null ? matchContacts(to, contacts) : [];

  // ERC-20 tokens live on the EVM runtime only; a Michelson-runtime destination is invalid.
  const erc20OnL1 = asset.kind === 'erc20' && dest === 'l1';

  const availableStr = balances[assetKey(asset)] ?? '0';
  const insufficient = !balancesLoading
    && parseFloat(amount || '0') > 0
    && parseFloat(amount || '0') > parseFloat(availableStr);

  const valid =
    dest !== null &&
    !erc20OnL1 &&
    (!isEvmSource || asset.kind === 'xtz') &&
    /^\d+(\.\d+)?$/.test(amount) &&
    Number(amount) > 0 &&
    !insufficient;

  const handleMax = () => {
    if (balancesLoading) return;
    if (asset.kind === 'xtz') {
      const mutezTotal = mutezToBig(balances.xtz ?? '0');
      const usable     = mutezTotal > MAX_FEE_RESERVE_MUTEZ
        ? mutezTotal - MAX_FEE_RESERVE_MUTEZ
        : 0n;
      setAmt(bigMutezToXtzString(usable));
    } else {
      setAmt(availableStr);
    }
  };

  // Predict the runtime the user will track on the explorer:
  //   tz1 → tz1: L1; everything else routes through L2 (NAC gateway L1→L2
  //   resolves to an EVM hash; EVM-source always broadcasts on L2 even when
  //   the destination is L1).
  const predictedRuntime: 'l1' | 'l2' =
    state.kind === 'tezos' && asset.kind === 'xtz' && dest === 'l1' ? 'l1' : 'l2';

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
        amount: amountToBaseUnits(amount, asset.kind === 'xtz' ? 18 : asset.decimals),
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

  // Offer to name the destination after a send when the book (loaded at mount)
  // doesn't know it yet; hidden once saved in this flow.
  const offerSave = shouldOfferSaveContact(to, contacts) && !contactSaved;

  const saveContact = async () => {
    if (saveName.trim() === '' || saveBusy) return;
    setSaveErr(null);
    setSaveBusy(true);
    try {
      const added = await sendPopupRequest<Contact>({ type: 'ADD_CONTACT', address: to.trim(), label: saveName });
      setContacts((prev) => [...prev, added]);
      setContactSaved(true);
      toast('Contact saved');
    } catch (e) {
      setSaveErr(e);
    } finally {
      setSaveBusy(false);
    }
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
            sourceKind={state.kind}
            cross={isCross}
            amount={parseFloat(amount || '0').toString()}
            asset={asset}
            to={truncAddr(to, 6)}
          />
          <StatusTimeline status={status} runtime={done.runtime} startedAt={doneStartedAt} />
          {!isFailed && done.hash !== '' && <StatusMeta status={status} runtime={done.runtime} hash={done.hash} />}
          {!isFailed && offerSave && (
            <div className="tx-card flat" style={{ marginTop: 12, padding: 12, width: '100%' }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                Save {truncAddr(to, 6)} as a contact
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="tx-input"
                  value={saveName}
                  maxLength={MAX_LABEL_LENGTH}
                  placeholder="Name"
                  onChange={(e) => { setSaveName(e.target.value); setSaveErr(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveContact(); }}
                  aria-label="Contact name"
                  style={{ height: 36, flex: 1, minWidth: 0 }}
                />
                <Button variant="outline" size="sm" disabled={saveName.trim() === '' || saveBusy} onClick={() => void saveContact()}>
                  {saveBusy ? 'Saving…' : 'Save'}
                </Button>
              </div>
              {saveErr != null && (
                <div style={{ marginTop: 8 }}>
                  <ErrorInline error={formatError(saveErr)} />
                </div>
              )}
            </div>
          )}
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
          ? 'Your tz1 signs a Michelson-runtime op routed to the EVM runtime through the NAC gateway. The receiving 0x address is credited atomically.'
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
              {toContact != null && (
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {toContact.label}
                </span>
              )}
              <span className="v">{truncAddr(to, 6)}</span>
              <ChainPill chain={destChain} />
            </div>
          </div>

          <div className="tx-card" style={{ padding: 0 }}>
            <Line label="Amount" value={`${parseFloat(amount).toLocaleString()} ${asset.symbol}`} />
            <div className="tx-divider" />
            <Line label="Routing" value={routingLabel(state.kind, dest)} />
            <div className="tx-divider" />
            <Line label="Network" value="Tezos X Previewnet" />
          </div>

          {state.kind === 'tezos' && isCross && (
            <>
              <div className="tx-kicker" style={{ marginTop: 16, marginBottom: 6 }}>
                What you actually sign
              </div>
              <div className="tx-card tx-cross-card" style={{ padding: 0 }}>
                <Line label="Michelson target" value={truncAddr(NAC_CONTRACT, 6)} />
                <div className="tx-divider" />
                <Line label="Entrypoint" value={asset.kind === 'xtz' ? 'call' : 'call_evm'} />
                {asset.kind === 'erc20' && (
                  <>
                    <div className="tx-divider" />
                    <Line label="Method" value="transfer(address,uint256)" />
                  </>
                )}
                <div className="tx-divider" />
                <Line
                  label="Debit (mutez)"
                  value={asset.kind === 'xtz' ? mutezToBig(amount).toString() : '0'}
                />
              </div>
            </>
          )}

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

          {!online && (
            <div style={{ fontSize: 12, color: 'var(--tx-warning)', padding: '4px 4px 8px', display: 'flex', gap: 8, alignItems: 'center' }} role="status">
              <Icon name="info" size={14} color="var(--tx-warning)" />
              <span>You&apos;re offline — sending needs the network.</span>
            </div>
          )}
        </div>
        <div className="tx-action-bar" style={{ gap: 8 }}>
          <Button variant="outline" onClick={back}>Cancel</Button>
          <Button variant="accent" full disabled={!online} onClick={submit}>Confirm & send</Button>
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
          const tokenOptions: AssetOption[] = tokens.map((t) => ({
            asset:    tokenToAsset(t),
            subLabel: isEvmSource ? 'Soon · EVM-source' : 'ERC-20 · EVM runtime',
            disabled: isEvmSource,
            title:    isEvmSource ? 'ERC-20 sends from EVM accounts are coming in a follow-up release.' : undefined,
          }));
          const options: AssetOption[] = [
            { asset: xtzAsset, subLabel: 'Native asset' },
            ...tokenOptions,
          ];
          return (
            <AssetSelector
              options={options}
              selected={asset}
              onSelect={setAsset}
              onAddToken={() => navigate('/tokens/add')}
            />
          );
        })()}

        <div className="tx-kicker" style={{ padding: '0 0 8px' }}>Recipient</div>
        <input
          className="tx-input mono"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onFocus={() => setToFocused(true)}
          onBlur={() => setToFocused(false)}
          placeholder={
            isEvmSource ? '0x… or tz1…' :
            asset.kind === 'erc20' ? '0x…' :
            'tz1… or 0x…'
          }
        />
        {suggestions.length > 0 && (
          <div className="tx-contact-suggest" role="listbox" aria-label="Contact suggestions">
            {suggestions.map((c) => (
              <button
                key={c.address}
                type="button"
                role="option"
                aria-selected={false}
                // mousedown (not click) so the pick lands before the input's blur.
                onMouseDown={(e) => { e.preventDefault(); setTo(c.address); setToFocused(false); }}
              >
                <Identicon seed={c.address} size="sm" />
                <span className="n">{c.label}</span>
                <span className="a">{truncAddr(c.address, 6)}</span>
              </button>
            ))}
          </div>
        )}
        {toContact != null && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--tx-fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={12} color="var(--tx-fg-muted)" />
            <span style={{ fontWeight: 500 }}>{toContact.label}</span>
            <span className="tx-mono">{truncAddr(to, 6)}</span>
          </div>
        )}
        <RoutingCard asset={asset} dest={dest} sourceKind={state.kind} />

        <div className="tx-kicker" style={{ padding: '18px 0 8px' }}>Amount</div>
        <div className="tx-card flat" style={{ padding: 16 }}>
          <input
            className="tx-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setAmt(v); }}
            placeholder="0"
          />
          <AvailableRow
            available={availableStr}
            asset={asset}
            insufficient={insufficient}
            loading={balancesLoading}
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
