import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn.js';

// options: [{ value, label }]
//
// Renders a fully custom, theme-matched dropdown panel (portaled to <body>
// so it can never be clipped by a modal's overflow-y-auto) on top of a real,
// visually-hidden native <select>. The native element stays the single
// source of truth — value/onChange/onBlur/name/ref all forward to it
// untouched — so react-hook-form's register()/reset()/setValue() and plain
// controlled value/onChange usage both keep working exactly as before.
// Picking a custom option updates the native select via its real value
// setter and dispatches a native 'change' event, which is how React (and
// RHF) is notified.
const Select = forwardRef(function Select(
  { label, error, options = [], placeholder, className, id, value, disabled, ...props },
  ref
) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value ?? '');
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const selectRef = useRef(null);
  const panelRef = useRef(null);
  const autoId = useId();
  const selectId = id || autoId;

  // Mirror the *actual* DOM value every render — covers the controlled
  // `value` prop, plus react-hook-form's reset()/setValue(), which set the
  // native select's value directly without going through onChange.
  useEffect(() => {
    const domValue = selectRef.current?.value ?? '';
    if (domValue !== current) setCurrent(domValue);
  });

  function openPanel() {
    if (disabled) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Scrolling the options list itself (when it overflows max-h-60) fires a
    // 'scroll' event too — ignore that so it doesn't close the panel out
    // from under the user mid-scroll. Only an ancestor/page scroll (which
    // would misposition the portaled panel) should close it.
    function onScrollOrResize(e) {
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const list = [...(placeholder ? [{ value: '', label: placeholder }] : []), ...options];
  const selected = list.find((o) => String(o.value) === String(current));

  function pick(val) {
    setOpen(false);
    if (String(val) === String(current)) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(selectRef.current, val);
    selectRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    setCurrent(val);
  }

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="label">
          {label}
        </label>
      )}
      <div className="relative" ref={wrapRef}>
        <select
          ref={(node) => {
            selectRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          id={selectId}
          value={value}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openPanel())}
          className={cn(
            'input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50',
            !selected?.value && placeholder && 'text-muted',
            error && 'ring-2 ring-red-500/60',
            className
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder || ''}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')} />
        </button>
      </div>

      {open &&
        !disabled &&
        coords &&
        createPortal(
          <ul
            ref={panelRef}
            role="listbox"
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
            className="z-[100] max-h-60 overflow-auto rounded-xl border border-border bg-elevated p-1 shadow-lg"
          >
            {list.length === 0 && <li className="px-3 py-2 text-sm text-muted">No options</li>}
            {list.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={String(o.value) === String(current)}
                  onClick={() => pick(o.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface',
                    String(o.value) === String(current) && 'bg-surface font-medium'
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {String(o.value) === String(current) && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

export default Select;
