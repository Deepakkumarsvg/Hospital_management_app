import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

const Input = forwardRef(function Input(
  { label, error, className, id, ...props },
  ref
) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn('input', error && 'ring-2 ring-red-500/60', className)}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

export default Input;
