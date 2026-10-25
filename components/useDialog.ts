'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a modal dialog: focus moves into it on open (to the
 * element marked `data-autofocus`, else the first focusable one), Tab stays
 * inside, Escape closes, and focus returns to whatever opened it. Put the
 * returned `ref` on the dialog element.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  // Read while rendering, before anything inside the dialog can take focus.
  const openerRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const opener = openerRef.current;
    // Not React's autoFocus: in development React re-runs this effect, and the
    // cleanup below hands focus back to the opener, which would undo it.
    (node.querySelector<HTMLElement>('[data-autofocus]') ??
      node.querySelector<HTMLElement>(FOCUSABLE) ??
      node
    ).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (!node) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, []);

  return ref;
}
