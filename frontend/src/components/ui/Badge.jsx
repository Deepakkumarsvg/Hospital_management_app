import { cn } from '../../utils/cn.js';

// Neutral by default; `tone` maps to semantic colors used sparingly.
const TONES = {
  neutral: 'border-border bg-surface text-muted',
  success: 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
  danger: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  solid: 'border-transparent bg-accent text-accent-fg',
};

export default function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone] || TONES.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}
