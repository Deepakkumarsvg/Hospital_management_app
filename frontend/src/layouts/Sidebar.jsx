import { NavLink } from 'react-router-dom';
import { Activity, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { groupedNavForRole } from '../utils/navigation.js';
import { cn } from '../utils/cn.js';

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const { role } = useAuth();
  const groups = groupedNavForRole(role);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden print:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed z-40 flex h-full w-64 flex-col border-r border-border bg-surface transition-all duration-200 lg:static lg:translate-x-0 print:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-20' : 'lg:w-64'
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <div className={cn('flex items-center gap-2 overflow-hidden', collapsed && 'lg:hidden')}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Activity className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold leading-tight">
              HMS<span className="block text-xs font-normal text-muted">Hospital System</span>
            </span>
          </div>
          <span className={cn('hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg', collapsed && 'lg:flex')}>
            <Activity className="h-5 w-5" />
          </span>
          <button
            onClick={onToggleCollapse}
            className="btn-ghost hidden h-8 w-8 !p-0 lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
          <button onClick={onClose} className="btn-ghost h-8 w-8 !p-0 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {groups.map((section, idx) => (
            <div key={section.group}>
              {collapsed ? (
                idx > 0 && <div className="mx-2 mb-2 border-t border-border" />
              ) : (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                  {section.group}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  if (item.todo) {
                    return (
                      <div
                        key={item.label}
                        className={cn(
                          'flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-muted/70',
                          collapsed && 'lg:justify-center'
                        )}
                        title="Coming soon"
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
                        </span>
                        <span className={cn('rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide', collapsed && 'lg:hidden')}>
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
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          collapsed && 'lg:justify-center',
                          isActive
                            ? 'bg-accent text-accent-fg'
                            : 'text-fg hover:bg-elevated'
                        )
                      }
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn('flex items-center justify-between gap-2 border-t border-border px-4 py-3', collapsed && 'lg:justify-center lg:px-0')}>
          <span className={cn('text-xs font-medium text-muted', collapsed && 'lg:hidden')}>Hospital Management System</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted">v1.0</span>
        </div>
      </aside>
    </>
  );
}
