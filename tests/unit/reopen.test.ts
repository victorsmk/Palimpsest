import { describe, it, expect } from 'vitest';
import { tokenize } from '@/lib/tokenizer';
import { reopenPoem } from '@/lib/editor/reopen';
import type { Poem } from '@/lib/models';

const tokens = tokenize('p1', 'Where the sea—wild and grey—meets sky.');
const ids = tokens.filter(t => t.isSelectable).map(t => t.id);

function poemWith(overrides: Partial<Poem> = {}): Poem {
  return {
    id: 'poem-1',
    schemaVersion: 1,
    passageId: 'p1',
    retainedTokenIds: [ids[1], ids[3], ids[5]],
    lineBreaks: [ids[3]],
    erasureStyle: 'faded',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title: 'Sea',
    notes: 'Written on the shore',
    ...overrides,
  };
}

describe('reopenPoem', () => {
  it('turns a matching poem into an editor snapshot', () => {
    const result = reopenPoem(poemWith(), tokens);
    expect(result).toEqual({
      ok: true,
      snapshot: {
        retainedTokenIds: [ids[1], ids[3], ids[5]],
        lineBreaks: [ids[3]],
        erasureStyle: 'faded',
        title: 'Sea',
        notes: 'Written on the shore',
      },
    });
  });

  it('copies the arrays so editing never mutates the stored poem', () => {
    const poem = poemWith();
    const result = reopenPoem(poem, tokens);
    if (!result.ok) throw new Error('expected ok');
    result.snapshot.retainedTokenIds.push('x');
    expect(poem.retainedTokenIds).toHaveLength(3);
  });

  it('defaults a missing title and notes to empty strings', () => {
    const poem = poemWith();
    delete poem.title;
    delete poem.notes;
    const result = reopenPoem(poem, tokens);
    expect(result.ok && result.snapshot.title).toBe('');
    expect(result.ok && result.snapshot.notes).toBe('');
  });

  it('refuses a poem whose passage is not in the library', () => {
    const result = reopenPoem(poemWith(), null);
    expect(result).toMatchObject({ ok: false, reason: 'passage-missing' });
  });

  it('refuses a poem that references a token the passage does not have', () => {
    const result = reopenPoem(poemWith({ retainedTokenIds: [ids[1], 'p1-token-9999'] }), tokens);
    expect(result).toMatchObject({ ok: false, reason: 'token-mismatch' });
  });

  it('refuses a poem that references a separator token', () => {
    const dash = tokens.find(t => t.kind === 'separator')!;
    const result = reopenPoem(poemWith({ retainedTokenIds: [ids[1], dash.id], lineBreaks: [] }), tokens);
    expect(result).toMatchObject({ ok: false, reason: 'token-mismatch' });
  });

  it('refuses retained tokens that are out of source order', () => {
    const result = reopenPoem(
      poemWith({ retainedTokenIds: [ids[3], ids[1]], lineBreaks: [] }),
      tokens
    );
    expect(result).toMatchObject({ ok: false, reason: 'token-mismatch' });
  });

  it('refuses duplicate retained tokens', () => {
    const result = reopenPoem(
      poemWith({ retainedTokenIds: [ids[1], ids[1]], lineBreaks: [] }),
      tokens
    );
    expect(result).toMatchObject({ ok: false, reason: 'token-mismatch' });
  });

  it('accepts a poem with nothing retained', () => {
    const result = reopenPoem(poemWith({ retainedTokenIds: [], lineBreaks: [] }), tokens);
    expect(result.ok).toBe(true);
  });
});
