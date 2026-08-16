// Mirrors the backend's passwordPolicy (authValidator.js) so the rules are
// visible while typing instead of arriving as a server error after submit.
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /\d/.test(v) },
];

export function isPasswordValid(v) {
  return PASSWORD_RULES.every((r) => r.test(v || ''));
}

export default function PasswordStrength({ value = '' }) {
  if (!value) return null;
  const passed = PASSWORD_RULES.filter((r) => r.test(value)).length;
  const pct = (passed / PASSWORD_RULES.length) * 100;
  const tone = passed === PASSWORD_RULES.length ? 'bg-green-500' : passed >= 2 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="mt-2 space-y-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-border">
        <div className={'h-full rounded-full transition-all ' + tone} style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-0.5">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.label} className={'flex items-center gap-1.5 text-xs ' + (ok ? 'text-green-600 dark:text-green-400' : 'text-muted')}>
              <span aria-hidden>{ok ? '✓' : '○'}</span> {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
