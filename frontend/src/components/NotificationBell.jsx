import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/notificationService.js';
import { formatDateTime } from '../utils/constants.js';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  const refreshCount = useCallback(() => { unreadCount().then(setCount).catch(() => {}); }, []);

  // Poll unread count periodically (lightweight in-app notifications).
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 30000);
    return () => clearInterval(t);
  }, [refreshCount]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try { setItems(await listNotifications()); } catch { setItems([]); }
    }
  };

  const onItem = async (n) => {
    if (!n.read) { await markRead(n.id || n._id).catch(() => {}); refreshCount(); }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const clearAll = async () => { await markAllRead().catch(() => {}); setItems((prev) => prev.map((n) => ({ ...n, read: true }))); setCount(0); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="btn-ghost relative h-9 w-9 !p-0" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-elevated shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button onClick={clearAll} className="flex items-center gap-1 text-xs text-muted hover:text-fg"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No notifications.</p>
            ) : items.map((n) => (
              <button key={n.id || n._id} onClick={() => onItem(n)} className={'flex w-full flex-col items-start gap-0.5 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-surface ' + (!n.read ? 'bg-surface/60' : '')}>
                <span className="flex w-full items-center justify-between">
                  <span className="text-sm font-medium">{n.title}</span>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                </span>
                {n.message && <span className="text-xs text-muted">{n.message}</span>}
                <span className="text-[10px] text-faint text-muted">{formatDateTime(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
