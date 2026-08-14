import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { HeartPulse, LayoutDashboard, CalendarDays, FileText, Receipt, User, LogOut, Menu, X } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { cn } from '../utils/cn.js';

const LINKS = [
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/portal/records', label: 'Records', icon: FileText },
  { to: '/portal/bills', label: 'Bills', icon: Receipt },
  { to: '/portal/profile', label: 'Profile', icon: User },
];

function NavItem({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-elevated hover:text-fg'
        )
      }
    >
      <Icon className="h-4 w-4" /> {label}
    </NavLink>
  );
}

export default function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <HeartPulse className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Patient Portal</p>
              <p className="hidden text-xs text-muted sm:block">{user?.name}</p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => <NavItem key={l.to} {...l} />)}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={doLogout} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-elevated hover:text-fg md:flex">
              <LogOut className="h-4 w-4" /> Logout
            </button>
            <button onClick={() => setOpen((v) => !v)} className="rounded-lg p-2 text-muted hover:bg-elevated md:hidden" aria-label="Menu">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {open && (
          <nav className="flex flex-col gap-1 border-t border-border px-4 py-3 md:hidden">
            {LINKS.map((l) => <NavItem key={l.to} {...l} onClick={() => setOpen(false)} />)}
            <button onClick={doLogout} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-elevated hover:text-fg">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
