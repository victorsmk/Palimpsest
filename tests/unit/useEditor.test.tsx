// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { tokenize } from '@/lib/tokenizer';
import { useEditor } from '@/lib/editor';
import type { Token } from '@/lib/models';

// Minimal renderHook: @testing-library/react needs @testing-library/dom, which this
// project does not depend on, and react-dom + act is all these tests need.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<Result, Props>(hook: (props: Props) => Result, initialProps: Props) {
  const result = { current: undefined as unknown as Result };
  function Probe({ hookProps }: { hookProps: Props }) {
    result.current = hook(hookProps);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const render = (props: Props) => act(() => root.render(createElement(Probe, { hookProps: props })));
  render(initialProps);
  return { result, rerender: render };
}

const tokensA = tokenize('a', 'one two three four');
const tokensB = tokenize('b', 'alpha beta gamma delta epsilon');

describe('useEditor passage switching', () => {
  it('never renders the old passage selection against the new passage tokens', () => {
    const seen: { passageId: string; retained: string[] }[] = [];

    const { result, rerender } = renderHook(
      ({ passageId, tokens }: { passageId: string; tokens: Token[] }) => {
        const editor = useEditor({ passageId, tokens });
        seen.push({ passageId, retained: editor.snapshot.retainedTokenIds });
        return editor;
      },
      { passageId: 'a', tokens: tokensA }
    );

    // Erase a word in passage A so its selection differs from the defaults.
    act(() => result.current.toggleToken('a-token-0001'));
    expect(result.current.retainedCount).toBe(3);

    seen.length = 0;
    rerender({ passageId: 'b', tokens: tokensB });

    // Every render after the switch must only reference passage B's tokens.
    expect(seen.length).toBeGreaterThan(0);
    for (const render of seen) {
      expect(render.passageId).toBe('b');
      expect(render.retained).toHaveLength(5);
      expect(render.retained.every(id => id.startsWith('b-'))).toBe(true);
    }
    expect(result.current.retainedCount).toBe(5);
    expect(result.current.canUndo).toBe(false);
  });

  it('keeps a draft loaded together with a passage switch', () => {
    const { result, rerender } = renderHook(
      ({ passageId, tokens }: { passageId: string; tokens: Token[] }) =>
        useEditor({ passageId, tokens }),
      { passageId: 'a', tokens: tokensA }
    );

    // The Studio switches passage and loads the draft in one event, so React
    // batches both into a single render.
    act(() => {
      result.current.loadSnapshot(
        {
          retainedTokenIds: ['b-token-0001', 'b-token-0003'],
          lineBreaks: ['b-token-0003'],
          erasureStyle: 'faded',
          title: 'Loaded',
          notes: 'From a draft',
        },
        'b'
      );
      rerender({ passageId: 'b', tokens: tokensB });
    });

    expect(result.current.snapshot.retainedTokenIds).toEqual(['b-token-0001', 'b-token-0003']);
    expect(result.current.erasureStyle).toBe('faded');
    expect(result.current.title).toBe('Loaded');
    expect(result.current.notes).toBe('From a draft');
  });

  it('keeps title and notes across undo and redo', () => {
    const { result } = renderHook(() => useEditor({ passageId: 'a', tokens: tokensA }), undefined);

    act(() => result.current.toggleToken('a-token-0000'));
    act(() => result.current.setTitle('Winter'));
    act(() => result.current.setNotes('First pass'));
    act(() => result.current.undo());

    expect(result.current.retainedCount).toBe(4);
    expect(result.current.title).toBe('Winter');
    expect(result.current.notes).toBe('First pass');

    act(() => result.current.redo());
    expect(result.current.retainedCount).toBe(3);
    expect(result.current.title).toBe('Winter');
  });
});
