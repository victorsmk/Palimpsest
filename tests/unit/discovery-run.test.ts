import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { tokenize } from '@/lib/tokenizer';
import { lookupWord, getSyllableMap } from '@/lib/syllables';
import { foundSearch, calculatePageDNA } from '@/lib/search/found';
import { assistedSearch } from '@/lib/search/assisted';

describe('Discovery Engine Execution on Real Gutenberg Passages', () => {
  it('executes Found and Assisted search on all 3 passages and reports output', async () => {
    const syllableMap = await getSyllableMap();

    const passageFiles = [
      'jane-eyre-ch1.json',
      'walden-woods.json',
      'dorian-gray-ch1.json',
    ];

    console.log('\n================================================================');
    console.log('PALIMPSEST — DISCOVERY ENGINE SEARCH RESULTS');
    console.log('================================================================\n');

    for (const fname of passageFiles) {
      const filePath = path.join(process.cwd(), 'data/texts', fname);
      const passage = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const tokens = tokenize(passage.id, passage.sourceText);
      const wordTokens = tokens.filter(t => t.isSelectable && t.kind === 'word');
      const wordCount = wordTokens.length;

      // Build syllable map for tokens
      const tokenSylMap = new Map();
      for (const t of wordTokens) {
        const res = lookupWord(t.word, syllableMap);
        tokenSylMap.set(t.id, res);
      }

      // 1. Found Search
      const foundCandidates = foundSearch(tokens, tokenSylMap, passage.id);
      const pageDNA = calculatePageDNA(foundCandidates.length, wordCount);

      // 2. Assisted Search
      const assistedCandidates = assistedSearch(tokens, tokenSylMap, passage.id, {
        maxSpanPerLine: 20,
        maxCandidates: 100,
      });

      console.log(`────────────────────────────────────────────────────────────`);
      console.log(`PASSAGE: ${passage.title}`);
      console.log(`Author: ${passage.attribution.author} (${passage.attribution.year})`);
      console.log(`Total Words: ${wordCount}`);
      console.log(`Page DNA: ${pageDNA} per 100 words`);
      console.log(`Found Mode Candidates (Contiguous 5-7-5): ${foundCandidates.length}`);
      console.log(`Assisted Mode Candidates (Bounded Subsequence): ${assistedCandidates.length}`);
      console.log(`────────────────────────────────────────────────────────────`);

      console.log('\n[Found Poetry Candidates]');
      if (foundCandidates.length === 0) {
        console.log('  (No contiguous 5-7-5 candidates found in this excerpt)');
      } else {
        foundCandidates.slice(0, 5).forEach((c, idx) => {
          console.log(`\n  Candidate #${idx + 1}:`);
          console.log(`    Line 1 (5): "${c.line1.tokens.map(t => t.text).join(' ')}"`);
          console.log(`    Line 2 (7): "${c.line2.tokens.map(t => t.text).join(' ')}"`);
          console.log(`    Line 3 (5): "${c.line3.tokens.map(t => t.text).join(' ')}"`);
        });
      }

      console.log('\n[Top Assisted Erasure Candidates]');
      if (assistedCandidates.length === 0) {
        console.log('  (No assisted candidates found)');
      } else {
        assistedCandidates.slice(0, 5).forEach((c, idx) => {
          console.log(`\n  Rank #${idx + 1} (Score: ${c.score}):`);
          console.log(`    Line 1 (5): "${c.line1.tokens.map(t => t.text).join(' ')}" [gaps: ${c.line1.gapCount}]`);
          console.log(`    Line 2 (7): "${c.line2.tokens.map(t => t.text).join(' ')}" [gaps: ${c.line2.gapCount}]`);
          console.log(`    Line 3 (5): "${c.line3.tokens.map(t => t.text).join(' ')}" [gaps: ${c.line3.gapCount}]`);
        });
      }

      console.log('\n');
    }
  });
});
