import type { ReactNode } from 'react';

export type IconName =
  | 'arrow-left' | 'arrow-right' | 'arrow-up-right' | 'arrow-down-left'
  | 'chevron-right' | 'chevron-down' | 'x' | 'check' | 'check-circle'
  | 'copy' | 'eye' | 'eye-off' | 'lock' | 'home' | 'send' | 'activity'
  | 'settings' | 'plus' | 'qr' | 'link' | 'shield' | 'alert' | 'info'
  | 'globe' | 'scan' | 'wallet' | 'refresh' | 'dots' | 'help' | 'bell'
  | 'logout';

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  color = 'currentColor',
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const S = (children: ReactNode) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  switch (name) {
    case 'arrow-left':      return S(<path d="M19 12H5M11 5 5 12l6 7" />);
    case 'arrow-right':     return S(<path d="M5 12h14M13 5l7 7-7 7" />);
    case 'arrow-up-right':  return S(<path d="M7 17 17 7M9 7h8v8" />);
    case 'arrow-down-left': return S(<path d="M17 7 7 17M15 17H7V9" />);
    case 'chevron-right':   return S(<path d="m9 6 6 6-6 6" />);
    case 'chevron-down':    return S(<path d="m6 9 6 6 6-6" />);
    case 'x':               return S(<path d="M6 6l12 12M18 6 6 18" />);
    case 'check':           return S(<path d="m5 12 5 5 9-11" />);
    case 'check-circle':    return S(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>);
    case 'copy':            return S(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
    case 'eye':             return S(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>);
    case 'eye-off':         return S(<><path d="M3 3l18 18" /><path d="M10.6 5.1A11 11 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4.2M6.6 6.6A18 18 0 0 0 1 12s4 7 11 7c2 0 3.7-.5 5.2-1.3" /></>);
    case 'lock':            return S(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>);
    case 'home':            return S(<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />);
    case 'send':            return S(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />);
    case 'activity':        return S(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />);
    case 'settings':        return S(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
    case 'plus':            return S(<path d="M12 5v14M5 12h14" />);
    case 'qr':              return S(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" /></>);
    case 'link':            return S(<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>);
    case 'shield':          return S(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />);
    case 'alert':           return S(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></>);
    case 'info':            return S(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>);
    case 'globe':           return S(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>);
    case 'scan':            return S(<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 12h10" />);
    case 'wallet':          return S(<><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M16 13h2M3 10h18" /></>);
    case 'refresh':         return S(<><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></>);
    case 'dots':            return S(<><circle cx="5" cy="12" r="1.25" /><circle cx="12" cy="12" r="1.25" /><circle cx="19" cy="12" r="1.25" /></>);
    case 'help':            return S(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17h.01" /></>);
    case 'bell':            return S(<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>);
    case 'logout':          return S(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>);
    default:                return null;
  }
}
