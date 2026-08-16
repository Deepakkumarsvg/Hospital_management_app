import { Activity } from 'lucide-react';

// Full-viewport loader for the moments before any layout exists — restoring
// the session on boot, or gating a protected route. Deliberately branded and
// centred, since it's the first thing a user sees on a cold load.
export default function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg px-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-fg/10 ring-1 ring-fg/10">
        <Activity className="h-7 w-7" />
      </span>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-fg/10" role="status" aria-label={label}>
        <div className="h-full w-1/3 animate-progress rounded-full bg-fg/60 motion-reduce:w-full motion-reduce:animate-none" />
      </div>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
