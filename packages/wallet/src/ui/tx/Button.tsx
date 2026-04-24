import type { ReactNode, MouseEvent } from 'react';

type Variant = 'primary' | 'accent' | 'accent-cyan' | 'outline' | 'ghost' | 'danger';
type Size    = 'sm' | 'xs';

export function Button({
  children,
  variant = 'primary',
  size,
  full,
  leftIcon,
  rightIcon,
  onClick,
  disabled,
  type = 'button',
}: {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  full?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const cls = ['tx-btn', variant, size, full && 'full'].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {leftIcon}{children}{rightIcon}
    </button>
  );
}

export function IconBtn({
  children,
  onClick,
  label,
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  size?: 'sm';
}) {
  return (
    <button
      type="button"
      className={['tx-ibtn', size].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}
