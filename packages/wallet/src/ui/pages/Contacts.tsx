/**
 * Contacts: wallet-global address book management. An add form (name +
 * address) on top, then the label-sorted list with inline rename and remove.
 * The book feeds the Send page's recipient suggestions and name resolution.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import type { Contact } from '@tezosx/wallet-core/domain/contact';
import { sendPopupRequest } from '@/shared/messaging';
import { detectRuntime } from '@tezosx/wallet-core/domain/validation';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { MAX_LABEL_LENGTH } from '@tezosx/wallet-core/shared/constants';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import { TopBar } from '../tx/TopBar';
import { Button, IconBtn } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { Identicon } from '../tx/Identicon';
import { ChainPill } from '../tx/ChainPill';
import { EmptyState } from '../tx/EmptyState';
import { ErrorInline } from '../tx/ErrorInline';
import { errorToast, toast } from '../tx/Toast';

export function Contacts({ state }: { state: VaultState }) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[] | null>(null);

  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [addErr,  setAddErr]  = useState<unknown>(null);
  const [busy,    setBusy]    = useState(false);

  // Inline rename: the address of the entry being edited + its draft label.
  const [editing,   setEditing]   = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const refresh = async () => {
    try {
      const list = await sendPopupRequest<Contact[]>({ type: 'LIST_CONTACTS' });
      setContacts(list);
    } catch (e) {
      errorToast({ message: formatError(e).title });
    }
  };

  useEffect(() => { if (state.status === 'unlocked') void refresh(); }, [state.status]);

  if (state.status !== 'unlocked') return null;

  const canAdd = name.trim() !== '' && detectRuntime(address) != null;

  const add = async () => {
    if (!canAdd || busy) return;
    setAddErr(null);
    setBusy(true);
    try {
      await sendPopupRequest<Contact>({ type: 'ADD_CONTACT', address: address.trim(), label: name });
      toast('Contact saved');
      setName('');
      setAddress('');
      await refresh();
    } catch (e) {
      setAddErr(e);
    } finally {
      setBusy(false);
    }
  };

  const startRename  = (c: Contact) => { setEditing(c.address); setEditLabel(c.label); };
  const cancelRename = () => { setEditing(null); setEditLabel(''); };

  const saveRename = async () => {
    if (editing == null || editLabel.trim() === '') return;
    try {
      await sendPopupRequest<Contact>({ type: 'RENAME_CONTACT', address: editing, label: editLabel });
      toast('Contact renamed');
      cancelRename();
      await refresh();
    } catch (e) {
      errorToast({ message: formatError(e).title });
    }
  };

  const remove = async (c: Contact) => {
    try {
      await sendPopupRequest({ type: 'REMOVE_CONTACT', address: c.address });
      toast(`${c.label} removed`);
      await refresh();
    } catch (e) {
      errorToast({ message: formatError(e).title });
    }
  };

  return (
    <div className="tx-page">
      <TopBar title="Contacts" onBack={() => navigate(-1)} />

      <div className="tx-page-scroll">
        <div style={{ padding: '12px 16px 16px' }}>
          <div className="tx-kicker" style={{ paddingBottom: 8 }}>Add contact</div>
          <input
            className="tx-input"
            value={name}
            maxLength={MAX_LABEL_LENGTH}
            placeholder="Name"
            onChange={(e) => { setName(e.target.value); setAddErr(null); }}
            aria-label="Contact name"
          />
          <input
            className="tx-input mono"
            value={address}
            placeholder="tz1… or 0x…"
            onChange={(e) => { setAddress(e.target.value); setAddErr(null); }}
            spellCheck={false}
            autoComplete="off"
            aria-label="Contact address"
            style={{ marginTop: 8 }}
          />
          {addErr != null && (
            <div style={{ marginTop: 8 }}>
              <ErrorInline error={formatError(addErr)} />
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Button variant="accent" full disabled={!canAdd || busy} onClick={() => void add()}>
              {busy ? 'Saving…' : 'Save contact'}
            </Button>
          </div>
        </div>

        <div className="tx-section-head"><span className="t">Saved contacts</span></div>

        {contacts == null ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-fg-muted)', fontSize: 13 }}>Loading…</div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Icon name="send" size={22} color="var(--tx-fg-muted)" />}
            title="No contacts yet"
            detail="Save the addresses you send to and pick them by name on the Send page."
          />
        ) : (
          <div>
            {contacts.map((c) => {
              const runtime = detectRuntime(c.address);
              return (
                <div key={c.address} className="tx-token-row">
                  <Identicon seed={c.address} size="sm" />
                  {editing === c.address ? (
                    <>
                      <input
                        className="tx-input"
                        value={editLabel}
                        maxLength={MAX_LABEL_LENGTH}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')  void saveRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        autoFocus
                        aria-label="New contact name"
                        style={{ flex: 1, minWidth: 0, height: 36 }}
                      />
                      <IconBtn label="Save name" size="sm" onClick={() => void saveRename()}>
                        <Icon name="check" size={14} />
                      </IconBtn>
                      <IconBtn label="Cancel rename" size="sm" onClick={cancelRename}>
                        <Icon name="x" size={14} />
                      </IconBtn>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <span className="tx-mono" style={{ fontSize: 11, color: 'var(--tx-fg-muted)' }}>
                            {shortAddr(c.address, 6, 4)}
                          </span>
                          {runtime != null && <ChainPill chain={runtime} />}
                        </div>
                      </div>
                      <Button variant="ghost" size="xs" onClick={() => startRename(c)}>Rename</Button>
                      <IconBtn label={`Remove ${c.label}`} size="sm" onClick={() => void remove(c)}>
                        <Icon name="x" size={14} />
                      </IconBtn>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
