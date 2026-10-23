import { describe, it, expect } from 'vitest';
import { tokenize } from '@/lib/tokenizer';
import fs from 'fs';
import path from 'path';

describe('Tokenizer module', () => {
  it('assigns stable sequential IDs and positions', () => {
    const text = 'Cold winter wind brought clouds.';
    const tokens = tokenize('test-passage', text);

    expect(tokens).toHaveLength(5);
    expect(tokens[0].id).toBe('test-passage-token-0000');
    expect(tokens[0].position).toBe(0);
    expect(tokens[0].text).toBe('Cold');
    expect(tokens[0].word).toBe('cold');
    expect(tokens[0].isSelectable).toBe(true);

    expect(tokens[4].id).toBe('test-passage-token-0004');
    expect(tokens[4].position).toBe(4);
    expect(tokens[4].text).toBe('clouds.');
    expect(tokens[4].word).toBe('clouds');
  });

  it('preserves attached punctuation in text and strips it in word', () => {
    const text = '“She regretted,” Bessie said: (silently).';
    const tokens = tokenize('punct-test', text);

    expect(tokens[0].text).toBe('“She');
    expect(tokens[0].word).toBe('she');

    expect(tokens[1].text).toBe('regretted,”');
    expect(tokens[1].word).toBe('regretted');

    expect(tokens[2].text).toBe('Bessie');
    expect(tokens[2].word).toBe('bessie');

    expect(tokens[3].text).toBe('said:');
    expect(tokens[3].word).toBe('said');

    expect(tokens[4].text).toBe('(silently).');
    expect(tokens[4].word).toBe('silently');
  });

  it('preserves contractions and normalizes curly apostrophes', () => {
    const text = "don't don’t haven’t it's";
    const tokens = tokenize('apostrophe-test', text);

    expect(tokens[0].word).toBe("don't");
    expect(tokens[1].word).toBe("don't");
    expect(tokens[2].word).toBe("haven't");
    expect(tokens[3].word).toBe("it's");
  });

  it('keeps hyphenated compounds as single tokens', () => {
    const text = 'honey-sweet Spartan-like pink-flowering';
    const tokens = tokenize('hyphen-test', text);

    expect(tokens).toHaveLength(3);
    expect(tokens[0].text).toBe('honey-sweet');
    expect(tokens[0].word).toBe('honey-sweet');
    expect(tokens[1].word).toBe('spartan-like');
    expect(tokens[2].word).toBe('pink-flowering');
  });

  it('treats em dashes as distinct non-selectable separator tokens', () => {
    const text = 'manner—something lighter—she said';
    const tokens = tokenize('emdash-test', text);

    // Should produce: 'manner', '—', 'something', 'lighter', '—', 'she', 'said'
    expect(tokens).toHaveLength(7);
    expect(tokens[0].text).toBe('manner');
    expect(tokens[0].isSelectable).toBe(true);

    expect(tokens[1].text).toBe('—');
    expect(tokens[1].kind).toBe('separator');
    expect(tokens[1].isSelectable).toBe(false);
    expect(tokens[1].word).toBe('');

    expect(tokens[2].text).toBe('something');
    expect(tokens[4].text).toBe('—');
    expect(tokens[4].isSelectable).toBe(false);
  });

  it('tracks paragraph breaks with lineBreakBefore', () => {
    const text = 'First paragraph first word.\n\nSecond paragraph first word.\n\nThird paragraph.';
    const tokens = tokenize('para-test', text);

    // Para 0 first token
    expect(tokens[0].text).toBe('First');
    expect(tokens[0].paragraphIndex).toBe(0);
    expect(tokens[0].lineBreakBefore).toBe(false);

    // Para 1 first token
    const p1Tokens = tokens.filter(t => t.paragraphIndex === 1);
    expect(p1Tokens[0].text).toBe('Second');
    expect(p1Tokens[0].lineBreakBefore).toBe(true);

    // Para 1 subsequent token
    expect(p1Tokens[1].lineBreakBefore).toBe(false);

    // Para 2 first token
    const p2Tokens = tokens.filter(t => t.paragraphIndex === 2);
    expect(p2Tokens[0].text).toBe('Third');
    expect(p2Tokens[0].lineBreakBefore).toBe(true);
  });

  it('tokenizes the actual curated Jane Eyre excerpt reliably', () => {
    const filePath = path.join(process.cwd(), 'data/texts/jane-eyre-ch1.json');
    const passage = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const tokens = tokenize(passage.id, passage.sourceText);
    expect(tokens.length).toBeGreaterThan(200);

    // Check invariants
    for (let i = 0; i < tokens.length; i++) {
      expect(tokens[i].position).toBe(i);
      expect(tokens[i].id).toBe(`${passage.id}-token-${String(i).padStart(4, '0')}`);
      if (tokens[i].kind === 'word') {
        expect(tokens[i].isSelectable).toBe(true);
        expect(tokens[i].word.length).toBeGreaterThan(0);
      }
    }
  });
});
