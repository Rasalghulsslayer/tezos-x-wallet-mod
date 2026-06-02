/**
 * LogoMark: the TezosX wallet brand mark rendered as an <img>.
 * Backed by the same icon128.png that the Chrome manifest ships in the
 * toolbar so the in-UI brand and the OS-level icon stay in sync.
 */

import logoUrl from '../../../icons/icon128.png';

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
}
