import { useMemo, useState } from 'react';
import { Icon } from '../../tx/Icon';
import { copySecretWithAutoClear } from '@/shared/clipboard';
import type { Pick } from './types';

export function CreatePane({
  pick, tzMnemonic, evmPrivkey,
  revealed, setRevealed,
  ack1, setAck1, ack2, setAck2,
  regenerate,
}: {
  pick:       Pick;
  tzMnemonic: string | null;
  evmPrivkey: string | null;
  revealed:   boolean; setRevealed: (b: boolean) => void;
  ack1:       boolean; setAck1: (b: boolean) => void;
  ack2:       boolean; setAck2: (b: boolean) => void;
  regenerate: () => void;
}) {
  const isTezos = pick.kind === 'tezos';
  const words   = useMemo(
    () => (isTezos && tzMnemonic != null ? tzMnemonic.split(' ') : []),
    [isTezos, tzMnemonic],
  );
  const [copied, setCopied] = useState(false);

  const valueToCopy = isTezos ? (tzMnemonic ?? '') : (evmPrivkey != null ? '0x' + evmPrivkey : '');
  const copy = () => {
    if (valueToCopy === '') return;
    copySecretWithAutoClear(valueToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="tx-add-reveal-card">
        <div className="head">
          <span className="ico"><Icon name="lock" size={13} /></span>
          {isTezos ? `Recovery phrase · ${words.length} words` : 'Private key · 64-char hex'}
        </div>
        <div
          className={`blur${revealed ? '' : ' locked'}${isTezos ? '' : ' evm'}`}
          onClick={() => { if (!revealed) setRevealed(true); }}
        >
          <div className="grid">
            {isTezos ? (
              words.map((w, i) => (
                <div className="word" key={i}>
                  <span className="n">{i + 1}</span><span>{w}</span>
                </div>
              ))
            ) : (
              <div className="word">{evmPrivkey != null ? '0x' + evmPrivkey : '…'}</div>
            )}
          </div>
          {!revealed && (
            <div className="lock-overlay">
              <span className="glyph"><Icon name="lock" size={22} /></span>
              <span className="ti">Make sure no one is watching</span>
              <span className="sub">Tap to reveal your {isTezos ? `${words.length}-word phrase` : 'private key'}.</span>
              <button type="button" className="reveal-btn">
                <Icon name="eye" size={11} /> Tap to reveal
              </button>
            </div>
          )}
        </div>

        {revealed && (
          <div className="tx-add-reveal-ack">
            <label className={`${ack1 ? 'on' : ''}${isTezos ? '' : ' l2'}`}>
              <span className="cb">{ack1 && <Icon name="check" size={10} />}</span>
              <span onClick={() => setAck1(!ack1)}>
                I've copied or written it down <strong>somewhere offline</strong>.
              </span>
              <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} style={{ display: 'none' }} />
            </label>
            <label className={`${ack2 ? 'on' : ''}${isTezos ? '' : ' l2'}`}>
              <span className="cb">{ack2 && <Icon name="check" size={10} />}</span>
              <span onClick={() => setAck2(!ack2)}>
                I understand that <strong>losing this {isTezos ? 'phrase' : 'key'} means losing the account</strong> — TezosX can't recover it.
              </span>
              <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>

      {revealed && (
        <div className="tx-add-reveal-meta">
          <button type="button" className={`copy-bar${copied ? ' done' : ''}`} onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={11} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={regenerate}
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--tx-fg-subtle)', fontSize: 10.5,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            <Icon name="refresh" size={10} /> Regenerate
          </button>
        </div>
      )}
    </>
  );
}
