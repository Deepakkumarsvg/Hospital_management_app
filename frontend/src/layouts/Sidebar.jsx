import { NavLink } from 'react-router-dom';
import { Activity, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { navForRole } from '../utils/navigation.js';
import { cn } from '../utils/cn.js';

export default function Sidebar({ open, onClose }) {
  const { role } = useAuth();
  const items = navForRole(role);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed z-40 flex h-full w-64 flex-col border-r border-border bg-surface transition-transform duration-200 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Activity className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold leading-tight">
              HMS<span className="block text-xs font-normal text-muted">Hospital System</span>
            </span>
          </div>
          <button onClick={onClose} className="btn-ghost h-8 w-8 !p-0 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            if (item.todo) {
              return (
                <div
                  key={item.label}
                  className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-muted/70"
                  title="Coming soon"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    Soon
                  </span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-fg'
                      : 'text-fg hover:bg-elevated'
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border px-4 py-3 text-xs text-muted">
          HMS v1.0.0 · Foundation
        </div>
      </aside>
    </>
  );
}
