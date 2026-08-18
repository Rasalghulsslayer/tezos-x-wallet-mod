import { Icon, type IconName } from './Icon';

/** Note: a quiet inline callout (info by default, warn variant for the
 *  shoulder-surf warning family). */
export function Note({
  icon = 'info', warn = false, children,
}: {
  icon?:    IconName;
  warn?:    boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`tx-note${warn ? ' warn' : ''}`}>
      <span className="i"><Icon name={icon} size={13} color={warn ? 'var(--tx-warning)' : 'var(--tx-fg-subtle)'} /></span>
      <span>{children}</span>
    </div>
  );
}
