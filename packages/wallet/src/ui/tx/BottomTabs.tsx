import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/',          label: 'Home',     icon: 'home' },
  { to: '/send',      label: 'Send',     icon: 'send' },
  { to: '/activity',  label: 'Activity', icon: 'activity' },
  { to: '/settings',  label: 'Settings', icon: 'settings' },
];

export function BottomTabs() {
  const navigate = useNavigate();
  const loc      = useLocation();
  const active   = TABS.find((t) => t.to === loc.pathname)?.to ?? '/';

  return (
    <nav className="tx-tabs">
      {TABS.map((t) => (
        <button
          key={t.to}
          className="tx-tab"
          aria-selected={active === t.to}
          onClick={() => navigate(t.to)}
        >
          <Icon name={t.icon} size={18} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
