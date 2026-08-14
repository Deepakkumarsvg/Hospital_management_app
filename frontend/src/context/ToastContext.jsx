import { createContext, useContext, useCallback, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../utils/cn.js';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (type, message, ttl = 3500) => {
      const id = ++idSeq;
      setToasts((t) => [...t, { id, type, message }]);
      if (ttl) setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const toast = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-xs flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2 rounded-lg border bg-elevated px-3 py-2.5 text-sm shadow-lg',
                t.type === 'success' && 'border-green-500/30',
                t.type === 'error' && 'border-red-500/30',
                t.type === 'info' && 'border-border'
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  t.type === 'success' && 'text-green-500',
                  t.type === 'error' && 'text-red-500',
                  t.type === 'info' && 'text-fg'
                )}
              />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
