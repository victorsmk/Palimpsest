// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { PassageLibrary, PASSAGE_UNAVAILABLE_MESSAGE } from '@/lib/library/passageLibrary';
import { usePassageChoice } from '@/components/usePassageChoice';
import { summaryOf, type Passage } from '@/lib/models';
import { passage } from '../contract/bookRepositoryContract';
import { renderHook } from '../helpers/react';

const A = passage('a', 'book');
const B = passage('b', 'book');
const C = passage('c', 'book');

/** A library whose fetches wait until the test lets them through. */
function gated() {
  const all: Passage[] = [A, B, C];
  const waiting = new Map<string, { resolve: (p: Passage | null) => void; reject: (e: Error) => void }>();
  const library = new PassageLibrary(all.map(summaryOf), id => new Promise((resolve, reject) => waiting.set(id, { resolve, reject })));
  const release = async (id: string) => {
    await act(async () => {
      waiting.get(id)!.resolve(all.find(p => p.id === id) ?? null);
    });
  };
  const fail = async (id: string) => {
    await act(async () => {
      waiting.get(id)!.reject(new Error('down'));
    });
  };
  return { library, release, fail, waiting };
}

describe('usePassageChoice', () => {
  it('shows nothing until the first passage has loaded, then that passage', async () => {
    const { library, release } = gated();
    const { result } = renderHook(() => usePassageChoice(library, 'a'), undefined);
    expect(result.current.passage).toBeNull();
    expect(result.current.chosenId).toBe('a');
    await release('a');
    expect(result.current.passage).toBe(A);
    expect(result.current.error).toBeNull();
  });

  it('does not load a passage that is already loaded', async () => {
    const loaded = PassageLibrary.of([A, B]);
    await loaded.ensure(['a']);
    const { result } = renderHook(() => usePassageChoice(loaded, 'a'), undefined);
    expect(result.current.passage).toBe(A);
  });

  it('marks a choice at once, but keeps the passage on screen until the new one has loaded', async () => {
    const { library, release } = gated();
    const { result } = renderHook(() => usePassageChoice(library, 'a'), undefined);
    await release('a');
    act(() => result.current.choose('b'));
    expect(result.current.chosenId).toBe('b');
    expect(result.current.passage).toBe(A);
    await release('b');
    expect(result.current.passage).toBe(B);
  });

  it('drops a choice that is overtaken by a later one, even if it arrives last', async () => {
    const { library, release } = gated();
    const { result } = renderHook(() => usePassageChoice(library, 'a'), undefined);
    await release('a');
    act(() => result.current.choose('b'));
    act(() => result.current.choose('c'));
    await release('c');
    expect(result.current.passage).toBe(C);
    await release('b'); // the earlier choice finishes after
    expect(result.current.passage).toBe(C);
    expect(result.current.chosenId).toBe('c');
  });

  it('says so when a passage cannot be loaded, and keeps showing the one before', async () => {
    const { library, release, fail } = gated();
    const { result } = renderHook(() => usePassageChoice(library, 'a'), undefined);
    await release('a');
    act(() => result.current.choose('b'));
    await fail('b');
    expect(result.current.error).toBe(PASSAGE_UNAVAILABLE_MESSAGE);
    expect(result.current.passage).toBe(A);
  });

  it('says so when the first passage cannot be loaded, and can be asked again', async () => {
    const { library, release, fail } = gated();
    const { result } = renderHook(() => usePassageChoice(library, 'a'), undefined);
    await fail('a');
    expect(result.current.passage).toBeNull();
    expect(result.current.error).toBe(PASSAGE_UNAVAILABLE_MESSAGE);
    act(() => result.current.choose('a'));
    expect(result.current.error).toBeNull();
    await release('a');
    expect(result.current.passage).toBe(A);
  });

  it('says so for a passage the library does not have', async () => {
    const library = PassageLibrary.of([A]);
    const { result } = renderHook(() => usePassageChoice(library, 'a'), undefined);
    await act(async () => {});
    act(() => result.current.choose('ghost'));
    await act(async () => {});
    expect(result.current.error).toBe(PASSAGE_UNAVAILABLE_MESSAGE);
    expect(result.current.passage).toBe(A);
  });
});
