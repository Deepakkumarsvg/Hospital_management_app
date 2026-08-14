import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';

export default function Spinner({ className, full = false }) {
  const icon = <Loader2 className={cn('h-6 w-6 animate-spin text-muted', className)} />;
  if (!full) return icon;
  return <div className="flex h-full w-full items-center justify-center py-16">{icon}</div>;
}
