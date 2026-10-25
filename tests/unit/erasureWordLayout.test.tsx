// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { tokenize } from '@/lib/tokenizer';
import { ErasureWord } from '@/components/ErasureWord';
import type { ErasureStyle } from '@/lib/models';
import { render } from '../helpers/react';

const [token] = tokenize('p', 'woods,');

// Classes that can change how much room a word takes: display, box model, sizing, type metrics.
const LAYOUT = /^(inline|block|flex|grid|hidden|float-|[mp][xytrbl]?-|-m|border(?!-\[?#)|w-|h-|min-|max-|font-|leading-|tracking-|whitespace-|text-(xs|sm|base|lg|xl|\dxl))/;

function layoutClasses(isRetained: boolean, style: ErasureStyle): string[] {
  const { container } = render(
    createElement(ErasureWord, {
      token,
      isRetained,
      style,
      onToggle: () => {},
      tabIndex: -1,
      onFocus: () => {},
    })
  );
  const button = container.querySelector('button')!;
  return button.className.split(/\s+/).filter(c => LAYOUT.test(c)).sort();
}

describe('ErasureWord layout', () => {
  const states: [string, boolean, ErasureStyle][] = [
    ['kept', true, 'blackout'],
    ['blackout', false, 'blackout'],
    ['faded ink', false, 'faded'],
    ['whiteout', false, 'whiteout'],
  ];

  it('gives every state the same layout box, so only paint differs between them', () => {
    const [kept, ...erased] = states.map(([, isRetained, style]) => layoutClasses(isRetained, style));
    expect(kept.length).toBeGreaterThan(0); // the pattern really matches the box classes
    erased.forEach((classes, i) => {
      expect(classes, states[i + 1][0]).toEqual(kept);
    });
  });

  it('does not use borders or vertical padding, which would change line height', () => {
    for (const [name, isRetained, style] of states) {
      const classes = layoutClasses(isRetained, style);
      expect(classes.filter(c => /^border|^p[ytb]-/.test(c)), name).toEqual([]);
    }
  });
});
