import { cn } from '../../utils/cn.js';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-9 w-9 border-[3px]',
};

// A ring spinner rather than a spinning icon — reads as a deliberate loading
// state at any size. `full` centres it in the available space with a caption;
// pass `label={null}` for a bare, unlabelled block.
export default function Spinner({ className, full = false, size = 'md', label = 'Loading…' }) {
  const ring = (
    <span
      role="status"
      aria-label={label || 'Loading'}
      className={cn(
        'inline-block animate-spin rounded-full border-fg/15 border-t-fg/70',
        SIZES[size] || SIZES.md,
        className
      )}
    />
  );

  if (!full) return ring;

  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 py-14">
      {ring}
      {label && <p className="text-xs text-muted">{label}</p>}
    </div>
  );
}
