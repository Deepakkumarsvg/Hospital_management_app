// Tiny classnames joiner — filters falsy values.
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
