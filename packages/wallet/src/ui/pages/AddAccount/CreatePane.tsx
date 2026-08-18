import { useMemo, useState } from 'react';
import { Icon } from '../../tx/Icon';
import { Ack } from '../../tx/Ack';
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
    // Stays "Copied" — the point of the state is the auto-clear note beside it.
    setCopied(true);
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
          // The acks live inside the card, below the secret: you cannot
          // promise to have written down something you have not seen.
          <div className="tx-add-reveal-ack">
            <Ack accent={isTezos ? 'purple' : 'cyan'} checked={ack1} onToggle={() => setAck1(!ack1)}>
              I've copied or written it down <strong>somewhere offline</strong>.
            </Ack>
            <Ack accent={isTezos ? 'purple' : 'cyan'} checked={ack2} onToggle={() => setAck2(!ack2)}>
              I understand that <strong>losing this {isTezos ? 'phrase' : 'key'} means losing the account</strong> — Tezos X can't recover it.
            </Ack>
          </div>
        )}
      </div>

      {revealed && (
        <div className="tx-add-reveal-meta">
          <button type="button" className="tx-btn ghost xs" onClick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={11} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="tx-btn ghost xs" style={{ color: 'var(--tx-fg-subtle)' }} onClick={regenerate}>
            <Icon name="refresh" size={11} /> Regenerate
          </button>
          {copied && (
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx-fg-subtle)' }}>
              clipboard clears in 30 s
            </span>
          )}
        </div>
      )}
    </>
  );
}
