import { useEffect, useRef, useState } from 'react';
import type { AccountId } from '../../domain/account';
import { MAX_LABEL_LENGTH } from '../../shared/constants';
import { ModalBackdrop } from './ModalBackdrop';

export function RenameModal({
  accountId,
  initialLabel,
  onClose,
  onSaved,
}: {
  accountId:    AccountId;
  initialLabel: string;
  onClose:      () => void;
  onSaved:      (label: string) => Promise<void>;
}) {
  const [label,  setLabel]  = useState(initialLabel);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const save = async () => {
    if (label.length > MAX_LABEL_LENGTH) {
      setError(`Label too long (max ${MAX_LABEL_LENGTH})`);
      return;
    }
    setSaving(true);
    try {
      await onSaved(label.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <ModalBackdrop onDismiss={onClose}>
      <div className="tx-modal" role="dialog" aria-label="Rename account">
        <div className="tx-modal-title">Rename account</div>
        <input
          ref={inputRef}
          className="tx-input"
          type="text"
          value={label}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="Account name (optional)"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
          disabled={saving}
        />
        {error != null && <div className="tx-modal-error">{error}</div>}
        <div className="tx-modal-actions">
          <button type="button" className="tx-btn ghost sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="tx-btn primary sm" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <input type="hidden" value={accountId} />
      </div>
    </ModalBackdrop>
  );
}
