import { isValidEdsk, isValidMnemonic } from '@/domain/validation';
import { shortAddr } from '@/shared/format';
import type { AccountSummary } from '@/shared/messages';
import { Identicon } from '../../tx/Identicon';
import { Icon } from '../../tx/Icon';
import type { Pick, TzMode } from './types';

export function ImportPane({
  pick,
  tzMode, setTzMode,
  tzImportValue, setTzImportValue,
  evmImportValue, setEvmImportValue,
  duplicate, duplicateAck, setDuplicateAck,
  parseError,
  onSwitchToExisting,
}: {
  pick:           Pick;
  tzMode:         TzMode; setTzMode: (m: TzMode) => void;
  tzImportValue:  string; setTzImportValue: (s: string) => void;
  evmImportValue: string; setEvmImportValue: (s: string) => void;
  duplicate:      AccountSummary | null;
  duplicateAck:   boolean; setDuplicateAck: (b: boolean) => void;
  parseError:     string | null;
  onSwitchToExisting: () => void;
}) {
  const isTezos = pick.kind === 'tezos';
  const value   = isTezos ? tzImportValue : evmImportValue;
  const setValue = isTezos ? setTzImportValue : setEvmImportValue;

  const trimmed = value.trim();
  const shape   = isTezos
    ? (tzMode === 'mnemonic'
        ? isValidMnemonic(trimmed.toLowerCase())
        : isValidEdsk(trimmed))
    : trimmed.length >= 64 && parseError == null;

  const wordCount = isTezos && tzMode === 'mnemonic' && trimmed !== ''
    ? trimmed.split(/\s+/).filter(Boolean).length
    : null;

  const showInvalid = !shape && trimmed !== '';
  const showValid   = shape && parseError == null;
  const taClass     = `ta${showInvalid ? ' invalid' : ''}${showValid ? ' valid' : ''}`;

  const validLine = isTezos
    ? (tzMode === 'mnemonic' ? `Valid · ${wordCount} words` : 'Valid · edsk')
    : `Valid · ${trimmed.replace(/^0x/, '').length} hex chars`;

  return (
    <>
      <div className="tx-add-import-card">
        {isTezos && (
          <div className="toggle">
            <button type="button" className={tzMode === 'mnemonic' ? 'on' : ''} onClick={() => setTzMode('mnemonic')}>
              Recovery phrase
            </button>
            <button type="button" className={tzMode === 'edsk' ? 'on' : ''} onClick={() => setTzMode('edsk')}>
              Private key (edsk)
            </button>
          </div>
        )}
        <textarea
          className={taClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isTezos
            ? (tzMode === 'mnemonic' ? 'whisper kingdom giraffe …' : 'edsk…')
            : '0xa1c2b3d4…'}
        />
        {trimmed !== '' && (
          <div className={`meta-line${shape ? ' valid' : showInvalid ? ' invalid' : ''}`}>
            {shape ? (
              <span className="lt"><Icon name="check" size={10} />{validLine}</span>
            ) : (
              <span className="lt"><Icon name="alert" size={10} />
                {isTezos
                  ? (tzMode === 'mnemonic'
                      ? 'Invalid — expected 12, 15, 18, 21 or 24 words'
                      : 'Invalid Tezos secret key')
                  : 'Expected 64 hex chars (with or without 0x prefix)'}
              </span>
            )}
            {wordCount != null && (
              <span style={{ color: 'var(--tx-fg-subtle)' }}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
            )}
          </div>
        )}
        {parseError != null && (
          <div style={{ fontSize: 11, color: 'var(--tx-danger)', marginTop: 4 }}>{parseError}</div>
        )}
      </div>

      {duplicate != null && (
        <div className="tx-add-dup-card">
          <div className="top">
            <span className="ico"><Icon name="alert" size={14} /></span>
            <div>
              <div className="ti">Already in your wallet</div>
              <div className="body">This {isTezos ? 'phrase' : 'key'} derives an account you've already imported.</div>
            </div>
          </div>
          <div className="mini-account">
            <Identicon seed={duplicate.primaryAddress} />
            <div className="info">
              <div className="nm">{duplicate.label?.trim() || 'Existing account'}</div>
              <div className="ad">
                {shortAddr(duplicate.primaryAddress)}
                {duplicate.secondaryAddress && <> · {shortAddr(duplicate.secondaryAddress)}</>}
              </div>
            </div>
            <button type="button" className="switch-btn" onClick={onSwitchToExisting}>
              Switch to it <Icon name="arrow-right" size={9} />
            </button>
          </div>
          <label className={`ack${duplicateAck ? ' on' : ''}`}>
            <span className="cb">{duplicateAck && <Icon name="check" size={10} />}</span>
            <span onClick={() => setDuplicateAck(!duplicateAck)}>
              Add it again anyway — I'll use it under a different label.
            </span>
            <input type="checkbox" checked={duplicateAck} onChange={(e) => setDuplicateAck(e.target.checked)} style={{ display: 'none' }} />
          </label>
        </div>
      )}
    </>
  );
}
