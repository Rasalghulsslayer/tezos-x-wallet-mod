/**
 * AddToken: 3-stage flow to add a custom ERC-20 token to the active account.
 *   paste-address → confirm-metadata → submit
 *
 * On NotErc20Error from the metadata fetch the user can engage tryAnyway;
 * the confirm stage then surfaces a non-dismissable warning band explaining
 * that balances will be displayed at 18-decimal default — they must verify
 * the actual decimals on Blockscout before sending. Duplicate addresses are
 * surfaced as an inline yellow card at the paste stage.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { EVM_EXPLORER } from '@tezosx/wallet-core/shared/constants';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { Dots } from '../tx/Dots';
import { ErrorInline } from '../tx/ErrorInline';
import { ErrorCard } from '../tx/ErrorCard';
import { toast } from '../tx/Toast';

type Stage = 'paste' | 'confirm' | 'submitting';

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function hexByteCount(a: string): number {
  return Math.floor(a.trim().replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '').length / 2);
}

export function AddToken({ state }: { state: VaultState }) {
  const navigate = useNavigate();

  const [stage,     setStage]     = useState<Stage>('paste');
  const [address,   setAddress]   = useState('');
  const [touched,   setTouched]   = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [parseErr,  setParseErr]  = useState<Error | null>(null);
  const [registered, setRegistered] = useState<RegisteredToken | null>(null);
  const [duplicate, setDuplicate] = useState<RegisteredToken | null>(null);
  const [tryAnyway, setTryAnyway] = useState(false);

  // Hydrate the registry once so we can dup-check at paste time.
  const [existing, setExisting] = useState<RegisteredToken[]>([]);
  useEffect(() => {
    if (state.status !== 'unlocked') return;
    void sendPopupRequest<RegisteredToken[]>({ type: 'LIST_REGISTERED_TOKENS' }).then(setExisting).catch(() => {});
  }, [state.status]);

  const isValidShape = EVM_ADDR_RE.test(address.trim());
  const stageIdx     = stage === 'paste' ? 0 : stage === 'confirm' ? 1 : 2;
  const showInvalid  = touched && address !== '' && !isValidShape;

  const back = () => {
    if (stage === 'paste') navigate(-1);
    else                   setStage('paste');
  };

  const onPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text.trim());
    } catch { /* clipboard may be unavailable in popup context */ }
  };

  const submitPaste = async () => {
    setTouched(true);
    setParseErr(null);
    setDuplicate(null);
    if (!isValidShape) return;
    const lower = address.trim().toLowerCase();
    const dup   = existing.find((t) => t.address.toLowerCase() === lower);
    if (dup != null) { setDuplicate(dup); return; }

    setBusy(true);
    try {
      // PEEK only — no write. The user must hit "Add {symbol}" in confirm to commit.
      const token = await sendPopupRequest<RegisteredToken>({
        type:    'PEEK_CUSTOM_TOKEN',
        address: lower,
        tryAnyway: false,
      });
      setRegistered(token);
      setStage('confirm');
    } catch (err) {
      setParseErr(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const submitTryAnyway = async () => {
    setBusy(true);
    setParseErr(null);
    try {
      const token = await sendPopupRequest<RegisteredToken>({
        type:    'PEEK_CUSTOM_TOKEN',
        address: address.trim().toLowerCase(),
        tryAnyway: true,
      });
      setRegistered(token);
      setTryAnyway(true);
      setStage('confirm');
    } catch (err) {
      setParseErr(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (registered == null) return;
    setStage('submitting');
    try {
      await sendPopupRequest<RegisteredToken>({
        type:      'ADD_CUSTOM_TOKEN',
        address:   registered.address,
        tryAnyway: tryAnyway,
      });
      toast(`${registered.symbol} added`);
      navigate('/', { replace: true });
    } catch (err) {
      setParseErr(err as Error);
      setStage('confirm');
    }
  };

  const isNotErc20 = parseErr != null && /does not respond as an ERC-20/.test(parseErr.message);

  const blockscoutUrl = useMemo(
    () => isValidShape ? `${EVM_EXPLORER}/address/${address.trim().toLowerCase()}` : '',
    [address, isValidShape],
  );

  if (state.status !== 'unlocked') return null;

  return (
    <div className="tx-page">
      <TopBar title="Add token" onBack={back} right={<Dots i={stageIdx} n={3} />} />

      {stage === 'paste' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div className="tx-addtoken-intro">
              <span className="tx-addtoken-runtime">
                <span className="sw" />EVM runtime · Tezos X
              </span>
              <div className="tx-addtoken-prompt">
                Paste a token <span>contract address</span>
              </div>
              <div className="tx-addtoken-sub">
                The wallet reads symbol, name and decimals straight from chain.
              </div>
            </div>

            {busy ? (
              <ConfirmSkeleton />
            ) : (
              <>
                <div className={['tx-addtoken-field', showInvalid && 'invalid', address !== '' && isValidShape && 'valid'].filter(Boolean).join(' ')}>
                  <input
                    className="tx-addtoken-input"
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); setParseErr(null); setDuplicate(null); }}
                    onBlur={() => setTouched(true)}
                    placeholder="0x…"
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    aria-label="Token contract address"
                    aria-invalid={showInvalid}
                  />
                  {address === '' ? (
                    <button type="button" className="tx-addtoken-paste" onClick={() => void onPaste()}>
                      <Icon name="copy" size={12} />
                      Paste
                    </button>
                  ) : (
                    <span className="tx-addtoken-end" aria-hidden="true">
                      <Icon name={isValidShape ? 'check' : 'alert'} size={16} />
                    </span>
                  )}
                </div>

                <div className="tx-addtoken-bytes tx-tnum">
                  <span>{hexByteCount(address)} / 20 bytes</span>
                  <span className={isValidShape ? 'ok' : undefined}>
                    {isValidShape ? 'valid 0x address' : 'expects 40 hex chars'}
                  </span>
                </div>

                {showInvalid && (
                  <div style={{ marginTop: 10 }}>
                    <ErrorInline error={formatError(new Error('Invalid 0x address (expected 40 hex chars)'))} />
                  </div>
                )}

                {duplicate != null && (
                  <div className="tx-addtoken-dup">
                    <div className="tx-addtoken-dup-top">
                      <span className="ico" aria-hidden="true"><Icon name="alert" size={16} /></span>
                      <div>
                        <div className="ti">This token is already in your wallet</div>
                        <div className="bd">
                          Registered as <strong>{duplicate.symbol}</strong> · <span className="mono">{shortAddr(duplicate.address)}</span>.
                        </div>
                      </div>
                    </div>
                    <button type="button" className="tx-addtoken-dup-go" onClick={() => navigate('/')}>
                      <Icon name="home" size={12} />
                      Go to Home
                    </button>
                  </div>
                )}

                {parseErr != null && !isNotErc20 && (
                  <div style={{ marginTop: 12 }}>
                    <ErrorInline error={formatError(parseErr)} />
                  </div>
                )}

                {parseErr != null && isNotErc20 && (
                  <div style={{ marginTop: 12 }}>
                    <ErrorCard error={{
                      title:  "This contract doesn't look like an ERC-20",
                      detail: "The contract didn't respond to decimals() — it may be non-standard. You can register it anyway, but balances may display incorrectly.",
                      raw:    parseErr.message,
                    }} />
                    <button type="button" className="tx-addtoken-tryanyway" onClick={() => void submitTryAnyway()} disabled={busy}>
                      {busy ? 'Adding…' : 'Try anyway'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="tx-action-bar">
            <Button variant="accent-cyan" full disabled={busy || !isValidShape} onClick={() => void submitPaste()}>
              {busy ? 'Reading metadata…' : 'Continue'}
            </Button>
          </div>
        </>
      )}

      {stage === 'confirm' && registered != null && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            {tryAnyway && (
              <div className="tx-addtoken-warn" role="alert">
                <span className="ico" aria-hidden="true"><Icon name="alert" size={18} /></span>
                <div>
                  <div className="ti">Balances may display incorrectly</div>
                  <div className="de">
                    The wallet defaulted to <strong>18 decimals</strong> because the contract didn't respond cleanly.
                    Verify the actual decimals on the contract before sending — a mismatch will show balances 10<sup>N</sup> too high or too low.
                  </div>
                  {blockscoutUrl !== '' && (
                    <button
                      type="button"
                      className="verify"
                      onClick={() => window.open(blockscoutUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <Icon name="external-link" size={12} />
                      Verify on Blockscout
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="tx-addtoken-head">
              <div className={['tx-addtoken-mark', tryAnyway && 'unknown'].filter(Boolean).join(' ')}>
                {tryAnyway ? '?' : registered.symbol.slice(0, 3).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="tx-addtoken-symbol">{registered.symbol}</div>
                <div className="tx-addtoken-name">
                  {tryAnyway ? 'Unknown · non-standard contract' : registered.name}
                </div>
                <div className="tx-addtoken-addr">{shortAddr(registered.address, 8, 6)}</div>
              </div>
            </div>

            <div className="tx-addtoken-standard">
              <span className={['sw', tryAnyway && 'warn'].filter(Boolean).join(' ')} />
              {tryAnyway ? 'Non-standard · added manually' : 'ERC-20 · EVM runtime'}
            </div>

            <div className="tx-addtoken-meta">
              <MetaRow
                label="Contract"
                value={shortAddr(registered.address, 8, 6)}
                full={registered.address}
                copyable
              />
              <MetaRow label="Name"   value={registered.name}   sans />
              <MetaRow label="Decimals" value={String(registered.decimals)} decimals assumed={tryAnyway} />
            </div>
          </div>
          <div className="tx-action-bar" style={{ gap: 8 }}>
            <Button variant="outline" onClick={() => navigate('/', { replace: true })} disabled={busy}>Cancel</Button>
            <Button variant="accent-cyan" full onClick={() => void finish()}>
              {`Add ${registered.symbol}`}
            </Button>
          </div>
        </>
      )}

      {stage === 'submitting' && (
        <div className="tx-page-scroll" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="tx-sending" />
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value, full, sans, decimals, assumed, copyable }: {
  label:     string;
  value:     string;
  full?:     string;
  sans?:     boolean;
  decimals?: boolean;
  assumed?:  boolean;
  copyable?: boolean;
}) {
  return (
    <div className={['tx-addtoken-meta-row', decimals && 'decimals', assumed && 'assumed'].filter(Boolean).join(' ')}>
      <span className="k">{label}</span>
      <span className={['v', sans && 'sans'].filter(Boolean).join(' ')}>
        {value}
        {assumed && <span className="tx-addtoken-assumed">assumed</span>}
        {copyable && (
          <button type="button" className="copy" aria-label="Copy address" onClick={() => void navigator.clipboard.writeText(full ?? value)}>
            <Icon name="copy" size={13} />
          </button>
        )}
      </span>
    </div>
  );
}

function ConfirmSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="tx-addtoken-skel-head">
        <span className="tx-skel tx-addtoken-skel-mark" />
        <div>
          <span className="tx-skel tx-addtoken-skel-sym" />
          <span className="tx-skel tx-addtoken-skel-name" />
        </div>
      </div>
      <span className="tx-skel tx-addtoken-skel-kick" />
      <div className="tx-addtoken-meta">
        <div className="tx-addtoken-meta-row">
          <span className="tx-skel" style={{ width: 64, height: 11 }} />
          <span className="tx-skel" style={{ width: 110, height: 11 }} />
        </div>
        <div className="tx-addtoken-meta-row">
          <span className="tx-skel" style={{ width: 48, height: 11 }} />
          <span className="tx-skel" style={{ width: 90, height: 11 }} />
        </div>
        <div className="tx-addtoken-meta-row">
          <span className="tx-skel" style={{ width: 64, height: 11 }} />
          <span className="tx-skel" style={{ width: 32, height: 14 }} />
        </div>
      </div>
    </div>
  );
}
