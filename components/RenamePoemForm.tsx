'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_TITLE_LENGTH } from '@/lib/services';

interface RenamePoemFormProps {
  /** The poem's current title, which is what the field starts with. */
  name: string;
  onSave: (title: string) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}

/** How close to the limit the title is before the count is shown. */
const SHOW_COUNT_FROM = MAX_TITLE_LENGTH - 20;

/**
 * Changes a poem's title in place. Enter saves, Escape cancels. The field starts with the current
 * title selected, so typing replaces it.
 */
export function RenamePoemForm({ name, onSave, onCancel, busy = false, error = null }: RenamePoemFormProps) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(onCancel);

  useEffect(() => {
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  // A native listener, so that Escape here cancels the rename and does not also close the collection:
  // the collection's own Escape handler sits on an element above this one and would run first.
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      cancelRef.current();
    }
    field.addEventListener('keydown', onKeyDown);
    return () => field.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (!busy) onSave(value);
      }}
      className="p-4"
    >
      <label htmlFor={`rename-${name}`} className="mb-1 block text-[11px] font-medium text-[#57544E]">
        New title for “{name}”
      </label>
      <input
        id={`rename-${name}`}
        ref={input}
        type="text"
        value={value}
        maxLength={MAX_TITLE_LENGTH}
        onChange={event => setValue(event.target.value)}
        aria-describedby={error ? `rename-error-${name}` : undefined}
        className="w-full rounded border border-[#E0D4BE] bg-[#FAF6EE] px-3 py-2 font-serif text-sm text-[#24231F] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6C3438]"
      />
      {value.length >= SHOW_COUNT_FROM && (
        <p className="mt-1 text-right text-[11px] text-[#57544E]">
          {value.length}/{MAX_TITLE_LENGTH}
        </p>
      )}
      {error && (
        <p id={`rename-error-${name}`} role="alert" className="mt-2 text-xs text-[#6C3438]">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-[#E0D4BE] px-3 py-1.5 text-xs font-medium text-[#24231F] hover:bg-[#E4D8C2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-[#24231F] px-3 py-1.5 text-xs font-medium text-[#F3EBDD] hover:bg-[#3D3A33] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C3438]"
        >
          {busy ? 'Saving…' : 'Save name'}
        </button>
      </div>
    </form>
  );
}
