import { forwardRef } from 'react';
import { cn } from '../../utils/cn.js';

const Card = forwardRef(function Card({ className, children, ...props }, ref) {
  return (
    <div ref={ref} className={cn('card p-5', className)} {...props}>
      {children}
    </div>
  );
});

export default Card;
