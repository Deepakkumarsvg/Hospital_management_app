import { useState, useRef, useEffect } from 'react';
import { Menu, LogOut, ChevronDown, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import NotificationBell from '../components/NotificationBell.jsx';

export default function Topbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = (user?.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="btn-ghost h-9 w-9 !p-0 lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="hidden text-base font-semibold sm:block">Hospital Management System</h1>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">{user?.name}</span>
              <span className="block text-xs text-muted">{user?.role}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-elevated shadow-lg">
              <div className="border-b border-border px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <UserRound className="h-4 w-4" /> {user?.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">{user?.email}</p>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-surface"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
