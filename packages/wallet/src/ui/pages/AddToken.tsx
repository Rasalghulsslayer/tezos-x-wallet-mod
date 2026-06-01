/**
 * AddToken: 3-stage flow to add a custom ERC-20 token to the active account.
 *   paste-address → confirm-metadata → label-and-submit
 *
 * On NotErc20Error from the metadata fetch the user can engage tryAnyway;
 * the confirm stage then surfaces a yellow warning band explaining that
 * balances will be displayed at 18-decimal default — they must verify the
 * actual decimals on Blockscout before sending. Duplicate addresses are
 * surfaced as ErrorInline at the paste stage.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@/shared/messages';
import type { RegisteredToken } from '@/domain/token';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@/domain/error';
import { EVM_EXPLORER } from '@/shared/constants';
import { shortAddr } from '@/shared/format';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { Dots } from '../tx/Dots';
import { ErrorInline } from '../tx/ErrorInline';
import { ErrorCard } from '../tx/ErrorCard';
import { toast } from '../tx/Toast';

type Stage = 'paste' | 'confirm' | 'submitting';

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

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

  if (state.status !== 'unlocked') return null;

  const isValidShape = EVM_ADDR_RE.test(address.trim());
  const stageIdx     = stage === 'paste' ? 0 : stage === 'confirm' ? 1 : 2;

  const back = () => {
    if (stage === 'paste') navigate(-1);
    else                   setStage('paste');
  };

  // ── Paste → Confirm: fetch metadata via ADD_CUSTOM_TOKEN dry-run? ──────────
  // We can't dry-run (the use case persists on success); instead we fetch the
  // metadata ourselves via the same eth_call path. Simpler: call ADD_CUSTOM_TOKEN
  // directly with tryAnyway=false. On success we have the token + can navigate.
  // On NotErc20Error we offer tryAnyway. On TokenAlreadyRegistered we surface
  // a duplicate inline error.
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
      const token = await sendPopupRequest<RegisteredToken>({
        type:    'ADD_CUSTOM_TOKEN',
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
        type:    'ADD_CUSTOM_TOKEN',
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
    toast(`${registered.symbol} added`);
    navigate('/', { replace: true });
  };

  const removeFailedSeed = async () => {
    // If we got to 'confirm' but the user backs out, we DO leave the token in
    // the registry (the add use case persisted it). Backing out only navigates
    // away; if the user wants to undo, Settings → Manage tokens removes it.
    // Keep this fn explicit so future iterations can call it on cancel.
    navigate('/', { replace: true });
  };

  const isNotErc20 = parseErr != null && /does not respond as an ERC-20/.test(parseErr.message);

  // Memoise the explorer link to the contract for the warning band's "verify" CTA.
  const blockscoutUrl = useMemo(
    () => isValidShape ? `${EVM_EXPLORER}/address/${address.trim().toLowerCase()}` : '',
    [address, isValidShape],
  );

  return (
    <div className="tx-page">
      <TopBar title="Add token" onBack={back} right={<Dots i={stageIdx} n={3} />} />

      {stage === 'paste' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 14 }}>
              Paste the ERC-20 contract address. The wallet will read its symbol, decimals, and name from chain.
            </div>
            <input
              className="tx-input mono"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setParseErr(null); setDuplicate(null); }}
              placeholder="0x…"
              autoFocus
            />
            {touched && !isValidShape && address !== '' && (
              <ErrorInline error={formatError(new Error('Invalid 0x address (expected 40 hex chars)'))} />
            )}
            {duplicate != null && (
              <div className="tx-duplicate-warning" style={{ marginTop: 12 }}>
                <Icon name="alert" size={14} />
                <div>
                  <div style={{ fontWeight: 500 }}>This token is already in your wallet.</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', marginTop: 2 }}>
                    Registered as <strong>{duplicate.symbol}</strong> · {shortAddr(duplicate.address)}.
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/')} leftIcon={<Icon name="home" size={11} />}>
                    Go to Home
                  </Button>
                </div>
              </div>
            )}
            {parseErr != null && !isNotErc20 && (
              <div style={{ marginTop: 12 }}><ErrorInline error={formatError(parseErr)} /></div>
            )}
            {parseErr != null && isNotErc20 && (
              <div style={{ marginTop: 12 }}>
                <ErrorCard error={{
                  title:  "This contract doesn't look like an ERC-20",
                  detail: "The contract didn't respond to decimals() — it may be non-standard. You can register it anyway, but balances may display incorrectly.",
                  raw:    parseErr.message,
                }} />
                <Button variant="ghost" full onClick={() => void submitTryAnyway()} disabled={busy}>
                  {busy ? 'Adding…' : 'Try anyway'}
                </Button>
              </div>
            )}
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={busy || !isValidShape} onClick={() => void submitPaste()}>
              {busy ? 'Reading metadata…' : 'Continue'}
            </Button>
          </div>
        </>
      )}

      {stage === 'confirm' && registered != null && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            {tryAnyway && (
              <div className="tx-duplicate-warning" style={{ marginBottom: 14 }}>
                <Icon name="alert" size={14} />
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>Balances may display incorrectly</div>
                  <div style={{ fontSize: 11, color: 'var(--tx-fg-muted)', lineHeight: 1.5 }}>
                    The wallet defaulted to 18 decimals because the contract didn't respond cleanly. Verify the actual decimals on the contract before sending — a mismatch will show balances 10<sup>N</sup> too high or too low.
                  </div>
                  {blockscoutUrl !== '' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(blockscoutUrl, '_blank', 'noopener,noreferrer')}
                      leftIcon={<Icon name="external-link" size={11} />}
                    >
                      Verify on Blockscout
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="tx-kicker" style={{ marginBottom: 6 }}>Token</div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 2 }}>{registered.symbol}</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>{registered.name}</div>

            <div className="tx-card flat" style={{ padding: 0 }}>
              <Row label="Address"  value={shortAddr(registered.address, 8, 6)} />
              <div className="tx-divider" />
              <Row label="Symbol"   value={registered.symbol} />
              <div className="tx-divider" />
              <Row label="Decimals" value={String(registered.decimals)} />
            </div>
          </div>
          <div className="tx-action-bar" style={{ gap: 8 }}>
            <Button variant="outline" onClick={removeFailedSeed} disabled={busy}>Cancel</Button>
            <Button variant="accent"  full onClick={() => void finish()}>Done</Button>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', fontSize: 13 }}>
      <span style={{ color: 'var(--tx-fg-muted)' }}>{label}</span>
      <span className="tx-mono" style={{ fontSize: 12, color: 'var(--tx-fg)' }}>{value}</span>
    </div>
  );
}
