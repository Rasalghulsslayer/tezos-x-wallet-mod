import { NavLink } from 'react-router-dom';
import { Home, Activity as ActivityIcon, Globe } from 'lucide-react';

const links = [
  { to: '/',            label: 'Home',        Icon: Home },
  { to: '/activity',    label: 'Activity',    Icon: ActivityIcon },
  { to: '/connections', label: 'Connections', Icon: Globe },
] as const;

export function NavBar() {
  return (
    <nav className="sticky bottom-0 grid grid-cols-3 border-t border-border bg-background/95 backdrop-blur">
      {links.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
              isActive ? 'text-brand-300' : 'text-muted-foreground hover:text-foreground'
            }`
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
