import { useEffect, useRef, useState } from 'react';
import { Search, Check, X } from 'lucide-react';
import { listPatients } from '../../services/patientService.js';

// Searchable patient selector. Calls back with the chosen patient object.
export default function PatientPicker({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const debounceRef = useRef();

  useEffect(() => {
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { items } = await listPatients({ search: query, limit: 8, status: 'ACTIVE' });
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query, open]);

  return (
    <div className="w-full" ref={boxRef}>
      <label className="label">Patient *</label>
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-elevated px-3 py-2">
          <div className="text-sm">
            <span className="font-medium">{value.fullName || `${value.firstName} ${value.lastName || ''}`}</span>
            <span className="ml-2 font-mono text-xs text-muted">{value.uhid}</span>
          </div>
          <button type="button" onClick={() => onChange(null)} className="text-muted hover:text-fg" aria-label="Clear patient">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className={'input pl-9 ' + (error ? 'ring-2 ring-red-500/60' : '')}
            placeholder="Search patient by name, UHID, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
          />
          {open && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-elevated shadow-lg">
              {loading ? (
                <p className="px-3 py-3 text-sm text-muted">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted">No patients found.</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id || p._id} type="button"
                    onClick={() => { onChange(p); setOpen(false); setQuery(''); }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface"
                  >
                    <span>
                      <span className="font-medium">{p.fullName}</span>
                      <span className="ml-2 text-xs text-muted">{p.gender?.[0]} · {p.age ?? '—'}y · {p.phone}</span>
                    </span>
                    <span className="font-mono text-xs text-muted">{p.uhid}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
