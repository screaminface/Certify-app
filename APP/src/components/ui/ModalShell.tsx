import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * ModalShell — the single behavioral primitive behind every dialog.
 * Layout/styling stays in each modal; the shell owns what they all
 * used to lack or duplicate:
 *  - portal to <body> (escapes transformed/overflow ancestors)
 *  - focus trap: Tab/Shift+Tab cycle inside; only the topmost shell
 *    of the stack responds, so nested dialogs behave
 *  - initial focus (respects a child's own autoFocus) and focus
 *    restore to the previously focused element on close
 *  - Escape → onClose (omit onClose to disable, e.g. while processing)
 *  - body scroll lock, counted across stacked shells
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

const shellStack: symbol[] = [];
let scrollLocks = 0;

interface ModalShellProps {
  onClose?: () => void;
  children: ReactNode;
}

export function ModalShell({ onClose, children }: ModalShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = Symbol('modal');
    shellStack.push(id);
    const root = rootRef.current;
    if (!root) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';

    // getClientRects() filters the hidden half of responsive modals
    // (desktop panel vs mobile bottom sheet).
    const getFocusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0
      );

    if (!root.contains(document.activeElement)) {
      const target = getFocusable()[0];
      if (target) {
        target.focus();
      } else {
        root.tabIndex = -1;
        root.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shellStack[shellStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const i = shellStack.indexOf(id);
      if (i !== -1) shellStack.splice(i, 1);
      if (--scrollLocks === 0) document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, []);

  return createPortal(<div ref={rootRef}>{children}</div>, document.body);
}
