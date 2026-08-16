import { cn } from '../../utils/cn.js';

// Placeholder blocks that mirror the shape of the content still loading, so
// the page doesn't jump when the data lands. A light sweep runs across them;
// it's dropped entirely for users who asked for reduced motion.
export function Skeleton({ className }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-fg/[0.07] dark:bg-fg/[0.09]', className)}>
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-fg/[0.09] to-transparent motion-reduce:hidden" />
    </div>
  );
}

// Row widths cycle so the placeholder looks like real, uneven data.
const WIDTHS = ['w-2/5', 'w-1/2', 'w-1/3', 'w-[45%]', 'w-2/5', 'w-1/4'];

// Stand-in for a table or list. Bare by default — most call sites already sit
// inside a Card; pass `card` when it needs its own surface.
export function ListSkeleton({ rows = 6, card = false, className }) {
  const body = (
    <div className={cn('divide-y divide-border/60', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        // Rows fade towards the bottom so the block reads as "more below".
        <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.1 }}>
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn('h-3.5', WIDTHS[i % WIDTHS.length])} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-5 w-16 shrink-0 rounded-full sm:block" />
          <Skeleton className="hidden h-8 w-20 shrink-0 rounded-lg md:block" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );

  return card ? <div className="card overflow-hidden">{body}</div> : body;
}

// The row of summary tiles most pages open with.
export function StatsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-2.5 p-4">
          <Skeleton className="h-3 w-20 max-w-full" />
          <Skeleton className="h-6 w-14" />
        </div>
      ))}
    </div>
  );
}

// Whole-page stand-in: the header block, an optional stat row, then a list.
// Matches the layout every page settles into, so nothing shifts on load.
export function PageSkeleton({ stats = 4, rows = 6 }) {
  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between gap-4 p-5">
        <div className="w-full max-w-xs space-y-2.5">
          <Skeleton className="h-5 w-40 max-w-full" />
          <Skeleton className="h-3.5 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
      </div>

      {stats > 0 && <StatsSkeleton count={stats} />}

      <ListSkeleton card rows={rows} />
    </div>
  );
}

export default Skeleton;
