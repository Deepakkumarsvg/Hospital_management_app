import { cn } from '../../utils/cn.js';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
};

export default function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...props
}) {
  return (
    <button
      className={cn(VARIANTS[variant] || VARIANTS.primary, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
