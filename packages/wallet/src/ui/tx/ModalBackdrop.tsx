import { useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * ModalBackdrop: shared backdrop + Escape/click-outside handler for the
 * wallet's modal sheets (RenameModal, RemoveAccountModal, etc.). Rendered
 * inside the page; do NOT render two of these simultaneously.
 */
export function ModalBackdrop({
  children, onDismiss,
}: {
  children:  ReactNode;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onDismiss(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="tx-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      {children}
    </div>
  );
}
