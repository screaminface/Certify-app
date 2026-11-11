import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COMPANIES, getCompanyStyle } from '../../constants/companies';

interface CompanySelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name — must match the visible field label (WCAG 2.5.3) */
  label: string;
  placeholder: string;
  required?: boolean;
  hasError?: boolean;
  className?: string;
}

/**
 * Styled replacement for the native <select> (select-only combobox pattern, WAI-ARIA APG).
 * Focus stays on the trigger; the highlighted option is exposed via aria-activedescendant.
 * Keys: ↑/↓, Home/End, Enter/Space select, Esc closes, typing jumps to a matching company.
 */
export const CompanySelect: React.FC<CompanySelectProps> = ({
  value,
  onChange,
  label,
  placeholder,
  required = false,
  hasError = false,
  className = '',
}) => {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // A legacy/imported value that is not in the list stays visible and selectable
  const options = useMemo<string[]>(
    () => (value && !(COMPANIES as readonly string[]).includes(value) ? [...COMPANIES, value] : [...COMPANIES]),
    [value]
  );

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', timer: 0 });

  const selectedIndex = options.indexOf(value);

  const openList = (index?: number) => {
    setActiveIndex(index ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  };

  const closeList = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (index: number) => {
    const next = options[index];
    if (next !== undefined) onChange(next);
    closeList();
  };

  // Close on outside pointer-down
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeList(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the highlighted option in view
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);

  const jumpToTyped = (char: string) => {
    const ta = typeahead.current;
    window.clearTimeout(ta.timer);
    ta.text += char.toLocaleLowerCase('bg');
    ta.timer = window.setTimeout(() => { ta.text = ''; }, 600);
    const match = options.findIndex(o => o.toLocaleLowerCase('bg').startsWith(ta.text));
    if (match >= 0) {
      if (open) setActiveIndex(match);
      else openList(match);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      } else if (e.key === 'Home') {
        e.preventDefault();
        openList(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        openList(last);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        jumpToTyped(e.key);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(last, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) commit(activeIndex);
        else setActiveIndex(i => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        // Don't let a parent modal treat this Escape as "close modal"
        e.preventDefault();
        e.stopPropagation();
        closeList();
        break;
      case 'Tab':
        closeList(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) jumpToTyped(e.key);
    }
  };

  const borderClass = hasError
    ? 'border-red-400'
    : open
      ? 'border-blue-500 ring-2 ring-blue-500'
      : 'border-slate-200 hover:border-slate-300';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        data-testid="company-select-trigger"
        aria-label={label}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-invalid={hasError || undefined}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
        className={`w-full px-3.5 py-2.5 border rounded-xl bg-white text-left flex items-center gap-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${borderClass}`}
      >
        {value ? (
          <>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCompanyStyle(value).dot}`} aria-hidden="true" />
            <span className="flex-1 truncate text-slate-900 font-medium">{value}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-slate-400">{placeholder}</span>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          className="absolute z-20 left-0 right-0 mt-1.5 max-h-64 overflow-auto py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-900/10"
        >
          {options.map((company, i) => {
            const isSelected = company === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={company}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                // Keep focus on the trigger while clicking an option
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                className={`mx-1.5 px-2.5 py-2 rounded-lg flex items-center gap-2.5 cursor-pointer select-none transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-900' : 'text-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCompanyStyle(company).dot}`} aria-hidden="true" />
                <span className={`flex-1 truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>{company}</span>
                {isSelected && <Check className="w-4 h-4 text-blue-700 flex-shrink-0" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
