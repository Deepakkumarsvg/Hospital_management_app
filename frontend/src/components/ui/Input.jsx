import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

// `icon` (a lucide component) renders a leading icon; `suffix` renders
// arbitrary content (e.g. a show/hide-password button) pinned to the right.
// Both are optional and purely additive — existing callers are unaffected.
const Input = forwardRef(function Input(
  { label, error, className, id, icon: Icon, suffix, ...props },
  ref
) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />}
        <input
          ref={ref}
          id={id}
          className={cn('input', Icon && 'pl-9', suffix && 'pr-9', error && 'ring-2 ring-red-500/60', className)}
          {...props}
        />
        {suffix}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

export default Input;
